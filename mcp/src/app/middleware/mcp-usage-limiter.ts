import { Redis } from "@upstash/redis";
import {
	applySpanAttributes,
	buildUsageLimitSpanAttributes,
	captureSentryException,
	logSentryMessage,
	withUsageLimitSpan,
} from "../../telemetry";

type MeteredPlan = "free" | "solo" | "solo_plus";

export type McpUsageIdentity = {
	subjectId: string | null;
	keyId: string | null;
	plan: string | null;
	mcpPeriodLimit: number | null;
	providerId?: string | null;
	modelId?: string | null;
	units?: number;
};

type MemoryCounter = {
	period: string;
	used: number;
};

export type McpUsageConsumeResult = {
	allowed: boolean;
	limit: number | null;
	usedThisPeriod: number | null;
	remaining: number | null;
	period: string | null;
	backend: "none" | "memory" | "upstash";
};

type McpUsageLimiterOptions = {
	nowMs?: () => number;
	env?: Record<string, string | undefined>;
	redis?: Pick<Redis, "incr" | "incrby" | "expire" | "set">;
};

type UpstashConfig = {
	url: string;
	token: string;
};

const CLEANUP_INTERVAL = 256;

export type McpUsageLimiter = {
	consume(identity: McpUsageIdentity): Promise<McpUsageConsumeResult>;
	reset(): void;
};

export function pruneUsageLimiterCaches(args: {
	userMemory: Map<string, { period: string; used: number }>;
	keyMemory: Map<string, { period: string; used: number }>;
	blockedCache: Map<string, number>;
	period: string;
	nowMs: number;
}): void {
	for (const [subjectId, counter] of args.userMemory) {
		if (counter.period !== args.period) {
			args.userMemory.delete(subjectId);
		}
	}
	for (const [keyId, counter] of args.keyMemory) {
		if (counter.period !== args.period) {
			args.keyMemory.delete(keyId);
		}
	}
	for (const [cacheKey, blockedUntil] of args.blockedCache) {
		if (blockedUntil <= args.nowMs) {
			args.blockedCache.delete(cacheKey);
		}
	}
}

function readUpstashConfig(
	env: Record<string, string | undefined>,
): UpstashConfig | null {
	const url = env.UPSTASH_REDIS_REST_URL?.trim();
	const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
	if (!url || !token) return null;
	return { url, token };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return fallback;
}

function parsePositiveInteger(
	value: string | undefined,
	fallback: number,
): number {
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.floor(parsed);
}

function normalizePeriod(nowMs: number): string {
	return new Date(nowMs).toISOString().slice(0, 7);
}

function normalizePositiveLimit(value: number | null): number | null {
	if (!Number.isFinite(value)) return null;
	const normalized = Math.floor(value ?? 0);
	return normalized > 0 ? normalized : null;
}

function normalizeUnits(value: number | undefined): number {
	if (!Number.isFinite(value)) return 1;
	const normalized = Math.floor(value ?? 1);
	return normalized > 0 ? normalized : 1;
}

function normalizePlan(value: string | null): MeteredPlan | null {
	if (value === "free" || value === "solo" || value === "solo_plus") {
		return value;
	}
	return null;
}

function userMonthKey(subjectId: string, period: string): string {
	return `bardo:usage:mcp:user:${subjectId}:month:${period}`;
}

function userTotalKey(subjectId: string): string {
	return `bardo:usage:mcp:user:${subjectId}:total`;
}

function keyMonthKey(keyId: string, period: string): string {
	return `bardo:usage:mcp:key:${keyId}:month:${period}`;
}

function keyTotalKey(keyId: string): string {
	return `bardo:usage:mcp:key:${keyId}:total`;
}

function keyLastUsedAtKey(keyId: string): string {
	return `bardo:usage:mcp:key:${keyId}:last_used_at`;
}

function keyLastProviderKey(keyId: string): string {
	return `bardo:usage:mcp:key:${keyId}:last_provider_id`;
}

function keyLastModelKey(keyId: string): string {
	return `bardo:usage:mcp:key:${keyId}:last_model_id`;
}

function emptyResult(): McpUsageConsumeResult {
	return {
		allowed: true,
		limit: null,
		usedThisPeriod: null,
		remaining: null,
		period: null,
		backend: "none",
	};
}

function clampRemaining(limit: number, used: number): number {
	return Math.max(0, limit - used);
}

export function createMcpUsageLimiter(options: McpUsageLimiterOptions = {}) {
	const now = options.nowMs ?? (() => Date.now());
	const env = options.env ?? process.env;
	const upstash = readUpstashConfig(env);
	const allowMemoryFallback = parseBoolean(
		env.BARDO_MCP_USAGE_LIMIT_ALLOW_MEMORY_FALLBACK,
		env.NODE_ENV !== "production",
	);
	const writeTotals = parseBoolean(env.BARDO_MCP_USAGE_WRITE_TOTALS, false);
	const writeLastUsed = parseBoolean(
		env.BARDO_MCP_USAGE_WRITE_LAST_USED,
		false,
	);
	const writeModelMetadata = parseBoolean(
		env.BARDO_MCP_USAGE_WRITE_MODEL_METADATA,
		false,
	);
	const blockedCacheTtlMs = parsePositiveInteger(
		env.BARDO_MCP_USAGE_BLOCK_CACHE_MS,
		30_000,
	);
	const redis =
		options.redis ??
		(upstash
			? new Redis({
					url: upstash.url,
					token: upstash.token,
				})
			: null);

	const userMemory = new Map<string, MemoryCounter>();
	const keyMemory = new Map<string, MemoryCounter>();
	const blockedCache = new Map<string, number>();
	let consumeCount = 0;

	function maybePruneCaches(period: string, nowMsValue: number): void {
		consumeCount += 1;
		if (consumeCount % CLEANUP_INTERVAL !== 0) {
			return;
		}
		pruneUsageLimiterCaches({
			userMemory,
			keyMemory,
			blockedCache,
			period,
			nowMs: nowMsValue,
		});
	}

	async function consumeUpstash(
		identity: {
			subjectId: string;
			keyId: string;
			providerId?: string | null;
			modelId?: string | null;
		},
		limit: number,
		period: string,
		nowMsValue: number,
		units: number,
	): Promise<McpUsageConsumeResult | null> {
		if (!redis) return null;
		const redisClient = redis;

		async function incrementCounter(key: string, by: number): Promise<number> {
			if (by === 1) {
				return await redisClient.incr(key);
			}
			return await redisClient.incrby(key, by);
		}

		try {
			const subjectId = identity.subjectId;
			const keyId = identity.keyId;
			const userPeriodKey = userMonthKey(subjectId, period);
			const userPeriodCounter = await incrementCounter(userPeriodKey, units);
			if (userPeriodCounter <= units) {
				await redisClient.expire(userPeriodKey, 60 * 60 * 24 * 400);
			}

			const used = Math.floor(userPeriodCounter);
			if (used > limit) {
				return {
					allowed: false,
					limit,
					usedThisPeriod: used,
					remaining: clampRemaining(limit, used),
					period,
					backend: "upstash",
				};
			}

			const keyPeriodKey = keyMonthKey(keyId, period);
			const keyPeriodCounter = await incrementCounter(keyPeriodKey, units);
			if (keyPeriodCounter <= units) {
				await redisClient.expire(keyPeriodKey, 60 * 60 * 24 * 400);
			}
			const sideWrites: Promise<unknown>[] = [];
			if (writeTotals) {
				sideWrites.push(incrementCounter(userTotalKey(subjectId), units));
				sideWrites.push(incrementCounter(keyTotalKey(keyId), units));
			}
			if (writeLastUsed) {
				sideWrites.push(
					redisClient.set(keyLastUsedAtKey(keyId), String(nowMsValue)),
				);
			}
			if (writeModelMetadata && identity.providerId) {
				sideWrites.push(
					redisClient.set(keyLastProviderKey(keyId), identity.providerId),
				);
			}
			if (writeModelMetadata && identity.modelId) {
				sideWrites.push(
					redisClient.set(keyLastModelKey(keyId), identity.modelId),
				);
			}
			if (sideWrites.length > 0) {
				await Promise.all(sideWrites);
			}

			return {
				allowed: true,
				limit,
				usedThisPeriod: used,
				remaining: clampRemaining(limit, used),
				period,
				backend: "upstash",
			};
		} catch (error) {
			captureSentryException(error);
			logSentryMessage("error", "mcp.usage_limiter.upstash_error", {
				"bardo.service": "mcp",
				"bardo.usage.backend": "upstash",
			});
			return null;
		}
	}

	function consumeMemory(
		identity: { subjectId: string; keyId: string },
		limit: number,
		period: string,
		units: number,
	): McpUsageConsumeResult {
		const currentUser = userMemory.get(identity.subjectId);
		const userCounter =
			currentUser && currentUser.period === period
				? currentUser
				: { period, used: 0 };
		userCounter.used += units;
		userMemory.set(identity.subjectId, userCounter);

		if (userCounter.used > limit) {
			return {
				allowed: false,
				limit,
				usedThisPeriod: userCounter.used,
				remaining: clampRemaining(limit, userCounter.used),
				period,
				backend: "memory",
			};
		}

		const currentKey = keyMemory.get(identity.keyId);
		const keyCounter =
			currentKey && currentKey.period === period
				? currentKey
				: { period, used: 0 };
		keyCounter.used += units;
		keyMemory.set(identity.keyId, keyCounter);

		return {
			allowed: true,
			limit,
			usedThisPeriod: userCounter.used,
			remaining: clampRemaining(limit, userCounter.used),
			period,
			backend: "memory",
		};
	}

	return {
		async consume(identity: McpUsageIdentity): Promise<McpUsageConsumeResult> {
			return await withUsageLimitSpan(async (span) => {
				const subjectId = identity.subjectId?.trim() || null;
				const keyId = identity.keyId?.trim() || null;
				const plan = normalizePlan(identity.plan);
				const limit = normalizePositiveLimit(identity.mcpPeriodLimit);
				const units = normalizeUnits(identity.units);

				function annotate(
					result: McpUsageConsumeResult,
					blockCacheHit: boolean,
				): McpUsageConsumeResult {
					applySpanAttributes(
						span,
						buildUsageLimitSpanAttributes({
							plan,
							backend: result.backend,
							limitPresent: limit !== null,
							allowed: result.allowed,
							period: result.period,
							blockCacheHit,
							writeTotalsEnabled: writeTotals,
							writeLastUsedEnabled: writeLastUsed,
							writeModelMetadataEnabled: writeModelMetadata,
						}),
					);
					return result;
				}

				if (!subjectId || !keyId || !plan || !limit) {
					return annotate(emptyResult(), false);
				}

				const nowMsValue = now();
				const period = normalizePeriod(nowMsValue);
				maybePruneCaches(period, nowMsValue);
				const blockedKey = `${subjectId}:${period}`;
				const blockedUntil = blockedCache.get(blockedKey);
				if (blockedUntil && blockedUntil > nowMsValue) {
					return annotate(
						{
							allowed: false,
							limit,
							usedThisPeriod: limit,
							remaining: 0,
							period,
							backend: redis ? "upstash" : "memory",
						},
						true,
					);
				}
				const upstashResult = await consumeUpstash(
					{
						subjectId,
						keyId,
						providerId: identity.providerId ?? null,
						modelId: identity.modelId ?? null,
					},
					limit,
					period,
					nowMsValue,
					units,
				);
				if (upstashResult) {
					if (!upstashResult.allowed) {
						blockedCache.set(blockedKey, nowMsValue + blockedCacheTtlMs);
					} else {
						blockedCache.delete(blockedKey);
					}
					return annotate(upstashResult, false);
				}

				if (!allowMemoryFallback) {
					blockedCache.set(blockedKey, nowMsValue + blockedCacheTtlMs);
					return annotate(
						{
							allowed: false,
							limit,
							usedThisPeriod: limit,
							remaining: 0,
							period,
							backend: "upstash",
						},
						false,
					);
				}

				const result = consumeMemory(
					{ subjectId, keyId },
					limit,
					period,
					units,
				);
				if (!result.allowed) {
					blockedCache.set(blockedKey, nowMsValue + blockedCacheTtlMs);
				} else {
					blockedCache.delete(blockedKey);
				}
				return annotate(result, false);
			});
		},
		reset(): void {
			userMemory.clear();
			keyMemory.clear();
			blockedCache.clear();
		},
	} satisfies McpUsageLimiter;
}
