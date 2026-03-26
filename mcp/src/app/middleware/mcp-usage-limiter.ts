type MeteredPlan = "free" | "solo";

export type McpUsageIdentity = {
	subjectId: string | null;
	keyId: string | null;
	plan: string | null;
	mcpPeriodLimit: number | null;
	tokenIdentifier?: string | null;
	providerId?: string | null;
	modelId?: string | null;
	toolName?: string | null;
	idempotencyKey?: string | null;
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
	backend: "none" | "memory" | "website";
};

type McpUsageLimiterOptions = {
	nowMs?: () => number;
	env?: Record<string, string | undefined>;
	controlPlane?: {
		readKeyUsage?(args: { keyId: string; periodStartMs: number }): Promise<{
			total: number;
			thisPeriod: number;
			lastUsedAt: number | null;
			lastUsedProviderId: string | null;
			lastUsedModelId: string | null;
			backend: "none" | "website";
		}>;
		consumeAcceptedToolCalls(args: {
			clerkUserId: string;
			tokenIdentifier?: string | null;
			keyId: string;
			plan: MeteredPlan;
			mcpPeriodLimit: number;
			idempotencyKey: string;
			toolName?: string | null;
			providerId?: string | null;
			modelId?: string | null;
			units: number;
		}): Promise<{
			allowed: boolean;
			limit: number;
			usedThisPeriod: number;
			remaining: number;
			period: string;
			backend: "memory" | "website";
		}>;
	} | null;
};

const CLEANUP_INTERVAL = 256;

export type McpUsageLimiter = {
	check(identity: McpUsageIdentity): Promise<McpUsageConsumeResult>;
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
	if (value === "free" || value === "solo") {
		return value;
	}
	return null;
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

function blockedResult(args: {
	limit: number;
	period: string;
	backend: "none" | "memory" | "website";
}): McpUsageConsumeResult {
	return {
		allowed: false,
		limit: args.limit,
		usedThisPeriod: args.limit,
		remaining: 0,
		period: args.period,
		backend: args.backend,
	};
}

export function createMcpUsageLimiter(options: McpUsageLimiterOptions = {}) {
	const now = options.nowMs ?? (() => Date.now());
	const env = options.env ?? process.env;
	const allowMemoryFallback = parseBoolean(
		env.BARDO_MCP_USAGE_LIMIT_ALLOW_MEMORY_FALLBACK,
		env.NODE_ENV !== "production",
	);
	const blockedCacheTtlMs = parsePositiveInteger(
		env.BARDO_MCP_USAGE_BLOCK_CACHE_MS,
		30_000,
	);
	const controlPlane = options.controlPlane ?? null;

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

	function peekMemory(
		identity: { subjectId: string; keyId: string },
		limit: number,
		period: string,
		units: number,
	): McpUsageConsumeResult {
		const currentUser = userMemory.get(identity.subjectId);
		const usedThisPeriod =
			currentUser && currentUser.period === period ? currentUser.used : 0;
		const nextUsed = usedThisPeriod + units;
		return {
			allowed: nextUsed <= limit,
			limit,
			usedThisPeriod,
			remaining: clampRemaining(limit, usedThisPeriod),
			period,
			backend: "memory",
		};
	}

	return {
		async check(identity: McpUsageIdentity): Promise<McpUsageConsumeResult> {
			const subjectId = identity.subjectId?.trim() || null;
			const keyId = identity.keyId?.trim() || null;
			const plan = normalizePlan(identity.plan);
			const limit = normalizePositiveLimit(identity.mcpPeriodLimit);
			const units = normalizeUnits(identity.units);

			if (!subjectId || !keyId || !plan || !limit) {
				return emptyResult();
			}

			const nowMsValue = now();
			const period = normalizePeriod(nowMsValue);
			maybePruneCaches(period, nowMsValue);
			const blockedKey = `${subjectId}:${period}`;
			const blockedUntil = blockedCache.get(blockedKey);
			if (blockedUntil && blockedUntil > nowMsValue) {
				return blockedResult({
					limit,
					period,
					backend: allowMemoryFallback ? "memory" : "none",
				});
			}

			if (controlPlane?.readKeyUsage) {
				try {
					const snapshot = await controlPlane.readKeyUsage({
						keyId,
						periodStartMs: Date.UTC(
							new Date(nowMsValue).getUTCFullYear(),
							new Date(nowMsValue).getUTCMonth(),
							1,
							0,
							0,
							0,
							0,
						),
					});
					const nextUsed = snapshot.thisPeriod + units;
					const result: McpUsageConsumeResult = {
						allowed: nextUsed <= limit,
						limit,
						usedThisPeriod: snapshot.thisPeriod,
						remaining: clampRemaining(limit, snapshot.thisPeriod),
						period,
						backend: snapshot.backend,
					};
					if (!result.allowed) {
						blockedCache.set(blockedKey, nowMsValue + blockedCacheTtlMs);
					} else {
						blockedCache.delete(blockedKey);
					}
					return result;
				} catch {
					if (!allowMemoryFallback) {
						blockedCache.set(blockedKey, nowMsValue + blockedCacheTtlMs);
						return blockedResult({
							limit,
							period,
							backend: "none",
						});
					}
				}
			} else if (!allowMemoryFallback) {
				blockedCache.set(blockedKey, nowMsValue + blockedCacheTtlMs);
				return blockedResult({
					limit,
					period,
					backend: "none",
				});
			}

			const result = peekMemory({ subjectId, keyId }, limit, period, units);
			if (!result.allowed) {
				blockedCache.set(blockedKey, nowMsValue + blockedCacheTtlMs);
			} else {
				blockedCache.delete(blockedKey);
			}
			return result;
		},
		async consume(identity: McpUsageIdentity): Promise<McpUsageConsumeResult> {
			const subjectId = identity.subjectId?.trim() || null;
			const keyId = identity.keyId?.trim() || null;
			const plan = normalizePlan(identity.plan);
			const limit = normalizePositiveLimit(identity.mcpPeriodLimit);
			const units = normalizeUnits(identity.units);

			if (!subjectId || !keyId || !plan || !limit) {
				return emptyResult();
			}

			const nowMsValue = now();
			const period = normalizePeriod(nowMsValue);
			maybePruneCaches(period, nowMsValue);
			const blockedKey = `${subjectId}:${period}`;
			const blockedUntil = blockedCache.get(blockedKey);
			if (blockedUntil && blockedUntil > nowMsValue) {
				return blockedResult({
					limit,
					period,
					backend: allowMemoryFallback ? "memory" : "none",
				});
			}

			if ((!controlPlane || !identity.idempotencyKey) && !allowMemoryFallback) {
				blockedCache.set(blockedKey, nowMsValue + blockedCacheTtlMs);
				return blockedResult({
					limit,
					period,
					backend: "none",
				});
			}

			if (controlPlane && identity.idempotencyKey) {
				try {
					const result = await controlPlane.consumeAcceptedToolCalls({
						clerkUserId: subjectId,
						tokenIdentifier: identity.tokenIdentifier ?? null,
						keyId,
						plan,
						mcpPeriodLimit: limit,
						idempotencyKey: identity.idempotencyKey,
						toolName: identity.toolName ?? null,
						providerId: identity.providerId ?? null,
						modelId: identity.modelId ?? null,
						units,
					});
					if (!result.allowed) {
						blockedCache.set(blockedKey, nowMsValue + blockedCacheTtlMs);
					} else {
						blockedCache.delete(blockedKey);
					}
					return result;
				} catch {
					if (!allowMemoryFallback) {
						blockedCache.set(blockedKey, nowMsValue + blockedCacheTtlMs);
						return blockedResult({
							limit,
							period,
							backend: "none",
						});
					}
				}
			}

			const result = consumeMemory({ subjectId, keyId }, limit, period, units);
			if (!result.allowed) {
				blockedCache.set(blockedKey, nowMsValue + blockedCacheTtlMs);
			} else {
				blockedCache.delete(blockedKey);
			}
			return result;
		},
		reset(): void {
			userMemory.clear();
			keyMemory.clear();
			blockedCache.clear();
		},
	} satisfies McpUsageLimiter;
}
