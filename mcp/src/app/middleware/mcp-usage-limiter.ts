import { Redis } from "@upstash/redis";
import {
	applySpanAttributes,
	buildUsageLimitSpanAttributes,
	captureSentryException,
	logSentryMessage,
	withUsageLimitSpan,
} from "../../telemetry";

type MeteredPlan = "free" | "solo" | "solo_plus";

type UsageIdentity = {
	subjectId: string | null;
	keyId: string | null;
	plan: string | null;
	mcpPeriodLimit: number | null;
	providerId?: string | null;
	modelId?: string | null;
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
	redis?: Pick<Redis, "incr" | "expire" | "set">;
};

type UpstashConfig = {
	url: string;
	token: string;
};

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
	const userTotals = new Map<string, number>();
	const keyTotals = new Map<string, number>();
	const blockedCache = new Map<string, number>();

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
	): Promise<McpUsageConsumeResult | null> {
		if (!redis) return null;

		try {
			const subjectId = identity.subjectId;
			const keyId = identity.keyId;
			const userPeriodCounter = await redis.incr(
				userMonthKey(subjectId, period),
			);
			if (userPeriodCounter === 1) {
				await redis.expire(userMonthKey(subjectId, period), 60 * 60 * 24 * 400);
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

			const keyPeriodCounter = await redis.incr(keyMonthKey(keyId, period));
			if (keyPeriodCounter === 1) {
				await redis.expire(keyMonthKey(keyId, period), 60 * 60 * 24 * 400);
			}
			if (writeTotals) {
				await redis.incr(userTotalKey(subjectId));
				await redis.incr(keyTotalKey(keyId));
			}
			if (writeLastUsed) {
				await redis.set(keyLastUsedAtKey(keyId), String(nowMsValue));
			}
			if (writeModelMetadata && identity.providerId) {
				await redis.set(keyLastProviderKey(keyId), identity.providerId);
			}
			if (writeModelMetadata && identity.modelId) {
				await redis.set(keyLastModelKey(keyId), identity.modelId);
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
	): McpUsageConsumeResult {
		const currentUser = userMemory.get(identity.subjectId);
		const userCounter =
			currentUser && currentUser.period === period
				? currentUser
				: { period, used: 0 };
		userCounter.used += 1;
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
		keyCounter.used += 1;
		keyMemory.set(identity.keyId, keyCounter);

		userTotals.set(
			identity.subjectId,
			(userTotals.get(identity.subjectId) ?? 0) + 1,
		);
		keyTotals.set(identity.keyId, (keyTotals.get(identity.keyId) ?? 0) + 1);

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
		async consume(identity: UsageIdentity): Promise<McpUsageConsumeResult> {
			return await withUsageLimitSpan(async (span) => {
				const subjectId = identity.subjectId?.trim() || null;
				const keyId = identity.keyId?.trim() || null;
				const plan = normalizePlan(identity.plan);
				const limit = normalizePositiveLimit(identity.mcpPeriodLimit);

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

				const result = consumeMemory({ subjectId, keyId }, limit, period);
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
			userTotals.clear();
			keyTotals.clear();
			blockedCache.clear();
		},
	};
}
