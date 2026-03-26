import {
	dailyKeyVerificationLimitForPlan,
	dailyUserVerificationLimitForPlan,
} from "./api-keys";
import type { PlanTier } from "./user-billing";
import { createWebsiteBackendClient } from "./website-backend";

type DailyVerificationBudgetLimiterOptions = {
	nowMs?: () => number;
	env?: Record<string, string | undefined>;
	websiteBackend?: {
		consumeRateLimitWindow(args: {
			scope: string;
			counterKey: string;
			limit: number;
			windowMs: number;
			nowMs?: number;
		}): Promise<DailyVerificationConsumeResult>;
	} | null;
	controlPlane?: {
		consumeRateLimitWindow(args: {
			scope: string;
			counterKey: string;
			limit: number;
			windowMs: number;
			nowMs?: number;
		}): Promise<DailyVerificationConsumeResult>;
	} | null;
};

type SubjectPlanCacheOptions = {
	nowMs?: () => number;
	ttlMs?: number;
};

type UsageCounter = {
	day: string;
	used: number;
};

type PlanCacheEntry<TValue> = {
	value: TValue;
	expiresAt: number;
};

type VerificationCounterScope = "user" | "key";

const CLEANUP_INTERVAL = 256;

export type DailyVerificationConsumeResult = {
	allowed: boolean;
	limit: number;
	used: number;
	remaining: number;
	backend: "memory" | "website";
	retryAfterSeconds?: number;
	resetEpochSeconds?: number;
};

export function pruneDailyVerificationCaches(args: {
	usageByCounter: Map<string, UsageCounter>;
	blockedCache: Map<string, number>;
	currentDay: string;
	nowMs: number;
}): void {
	for (const [counterId, usage] of args.usageByCounter) {
		if (usage.day !== args.currentDay) {
			args.usageByCounter.delete(counterId);
		}
	}
	for (const [cacheKey, blockedUntil] of args.blockedCache) {
		if (blockedUntil <= args.nowMs) {
			args.blockedCache.delete(cacheKey);
		}
	}
}

export function rotateConfirmedKeyWindow(args: {
	confirmedKeys: Set<string>;
	activeDay: string | null;
	currentDay: string;
}): string {
	if (args.activeDay === args.currentDay) {
		return args.currentDay;
	}
	args.confirmedKeys.clear();
	return args.currentDay;
}

function dayKey(nowMs: number): string {
	return new Date(nowMs).toISOString().slice(0, 10);
}

function readPositiveMs(value: number | undefined, fallback: number): number {
	if (!Number.isFinite(value)) {
		return fallback;
	}
	const normalized = Math.floor(value ?? fallback);
	return normalized > 0 ? normalized : fallback;
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

function limitForScope(
	scope: VerificationCounterScope,
	plan: PlanTier,
	env: Record<string, string | undefined>,
): number {
	return scope === "user"
		? dailyUserVerificationLimitForPlan(plan, env)
		: dailyKeyVerificationLimitForPlan(plan, env);
}

function memoryConsume(
	usageByCounter: Map<string, UsageCounter>,
	counterId: string,
	day: string,
	limit: number,
): DailyVerificationConsumeResult {
	const existing = usageByCounter.get(counterId);
	const usage = existing && existing.day === day ? existing : { day, used: 0 };

	if (usage.used >= limit) {
		usageByCounter.set(counterId, usage);
		return {
			allowed: false,
			limit,
			used: usage.used,
			remaining: 0,
			backend: "memory",
		};
	}

	usage.used += 1;
	usageByCounter.set(counterId, usage);
	return {
		allowed: true,
		limit,
		used: usage.used,
		remaining: Math.max(0, limit - usage.used),
		backend: "memory",
	};
}

export function createDailyVerificationBudgetLimiter(
	options: DailyVerificationBudgetLimiterOptions = {},
) {
	const usageByCounter = new Map<string, UsageCounter>();
	const now = options.nowMs ?? (() => Date.now());
	const env = options.env ?? process.env;
	const websiteBackend =
		options.websiteBackend !== undefined
			? options.websiteBackend
			: options.controlPlane === undefined
				? (() => {
						try {
							return createWebsiteBackendClient(env);
						} catch {
							return null;
						}
					})()
				: options.controlPlane;
	const allowMemoryFallback = parseBoolean(
		env.BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK,
		env.NODE_ENV !== "production",
	);
	const blockedCacheMs = parsePositiveInteger(
		env.BARDO_VERIFY_BLOCK_CACHE_MS,
		30_000,
	);
	const blockedCache = new Map<string, number>();
	let consumeCount = 0;

	function maybePruneCaches(currentDay: string, nowMs: number): void {
		consumeCount += 1;
		if (consumeCount % CLEANUP_INTERVAL !== 0) {
			return;
		}
		pruneDailyVerificationCaches({
			usageByCounter,
			blockedCache,
			currentDay,
			nowMs,
		});
	}

	async function consume(
		scope: VerificationCounterScope,
		id: string,
		plan: PlanTier,
	): Promise<DailyVerificationConsumeResult> {
		const limit = limitForScope(scope, plan, env);
		const nowMs = now();
		const day = dayKey(nowMs);
		maybePruneCaches(day, nowMs);
		const safeId = id.trim() || "unknown";
		const blockedKey = `${scope}:${safeId}:${day}`;
		const blockedUntil = blockedCache.get(blockedKey);
		if (blockedUntil && blockedUntil > nowMs) {
			return {
				allowed: false,
				limit,
				used: limit,
				remaining: 0,
				backend: "memory",
			};
		}

		if (websiteBackend) {
			try {
				const result = await websiteBackend.consumeRateLimitWindow({
					scope: `verify:${scope}`,
					counterKey: safeId,
					limit,
					windowMs: 86_400_000,
					nowMs,
				});
				return {
					allowed: result.allowed,
					limit,
					used: limit - (result.remaining ?? 0),
					remaining: result.remaining ?? 0,
					backend: result.backend ?? "website",
					retryAfterSeconds: result.retryAfterSeconds,
					resetEpochSeconds: result.resetEpochSeconds,
				};
			} catch {
				if (!allowMemoryFallback) {
					blockedCache.set(blockedKey, nowMs + blockedCacheMs);
					return {
						allowed: false,
						limit,
						used: limit,
						remaining: 0,
						backend: "memory",
					};
				}
			}
		}

		const memoryResult = memoryConsume(
			usageByCounter,
			`${scope}:${safeId}`,
			day,
			limit,
		);
		if (!memoryResult.allowed) {
			blockedCache.set(blockedKey, nowMs + blockedCacheMs);
		} else {
			blockedCache.delete(blockedKey);
		}
		return memoryResult;
	}

	return {
		consumePreAuthKey(
			secretHash: string,
			plan: PlanTier = "free",
		): Promise<DailyVerificationConsumeResult> {
			return consume("key", `preauth:${secretHash}`, plan);
		},
		consumeUser(
			subject: string,
			plan: PlanTier,
		): Promise<DailyVerificationConsumeResult> {
			return consume("user", subject, plan);
		},
		consumeKey(
			keyId: string,
			plan: PlanTier,
		): Promise<DailyVerificationConsumeResult> {
			return consume("key", keyId, plan);
		},
		reset(): void {
			usageByCounter.clear();
			blockedCache.clear();
		},
	};
}

export function createSubjectPlanCache<TValue = PlanTier>(
	options: SubjectPlanCacheOptions = {},
) {
	const bySubject = new Map<string, PlanCacheEntry<TValue>>();
	const now = options.nowMs ?? (() => Date.now());
	const ttlMs = readPositiveMs(options.ttlMs, 300_000);

	return {
		async resolve(
			subject: string,
			lookup: () => Promise<TValue>,
		): Promise<TValue> {
			const current = now();
			const cached = bySubject.get(subject);
			if (cached && cached.expiresAt > current) {
				return cached.value;
			}

			const value = await lookup();
			bySubject.set(subject, { value, expiresAt: current + ttlMs });
			return value;
		},
		reset(): void {
			bySubject.clear();
		},
	};
}
