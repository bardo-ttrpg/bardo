import {
	dailyKeyVerificationLimitForPlan,
	dailyUserVerificationLimitForPlan,
} from "./api-keys";
import type { PlanTier } from "./user-billing";

type DailyVerificationBudgetLimiterOptions = {
	nowMs?: () => number;
	env?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
};

type SubjectPlanCacheOptions = {
	nowMs?: () => number;
	ttlMs?: number;
};

type UsageCounter = {
	day: string;
	used: number;
};

type PlanCacheEntry = {
	plan: PlanTier;
	expiresAt: number;
};

type VerificationCounterScope = "user" | "key";

type UpstashConfig = {
	url: string;
	token: string;
};

export type DailyVerificationConsumeResult = {
	allowed: boolean;
	limit: number;
	used: number;
	remaining: number;
	backend: "memory" | "upstash";
};

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

function readUpstashConfig(
	env: Record<string, string | undefined>,
): UpstashConfig | null {
	const url = env.UPSTASH_REDIS_REST_URL?.trim();
	const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
	if (!url || !token) return null;
	return { url: url.replace(/\/+$/, ""), token };
}

function counterKey(
	scope: VerificationCounterScope,
	id: string,
	day: string,
): string {
	return `bardo:verify:${scope}:${id}:${day}`;
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

async function upstashIncrement(
	key: string,
	config: UpstashConfig,
	fetchImpl: typeof fetch,
	timeoutMs: number,
): Promise<number | null> {
	const endpoint = `${config.url}/incr/${encodeURIComponent(key)}`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(endpoint, {
			method: "POST",
			headers: {
				authorization: `Bearer ${config.token}`,
			},
			signal: controller.signal,
		});
		if (!response.ok) {
			return null;
		}
		const payload = (await response.json()) as { result?: unknown };
		if (
			typeof payload.result !== "number" ||
			!Number.isFinite(payload.result)
		) {
			return null;
		}
		return Math.floor(payload.result);
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

async function upstashEnsureExpiry(
	key: string,
	config: UpstashConfig,
	fetchImpl: typeof fetch,
	timeoutMs: number,
): Promise<boolean> {
	const endpoint = `${config.url}/expire/${encodeURIComponent(key)}/86400`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(endpoint, {
			method: "POST",
			headers: {
				authorization: `Bearer ${config.token}`,
			},
			signal: controller.signal,
		});
		return response.ok;
	} catch {
		// Ignore expiry failures; the caller will retry on later requests until
		// this key has a confirmed TTL for the current process lifetime.
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

export function createDailyVerificationBudgetLimiter(
	options: DailyVerificationBudgetLimiterOptions = {},
) {
	const usageByCounter = new Map<string, UsageCounter>();
	const now = options.nowMs ?? (() => Date.now());
	const env = options.env ?? process.env;
	const fetchImpl = options.fetchImpl ?? fetch;
	const upstash = readUpstashConfig(env);
	const allowMemoryFallback = parseBoolean(
		env.BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK,
		env.NODE_ENV !== "production",
	);
	const upstashTimeoutMs = parsePositiveInteger(
		env.BARDO_UPSTASH_TIMEOUT_MS,
		1200,
	);
	const blockedCacheMs = parsePositiveInteger(
		env.BARDO_VERIFY_BLOCK_CACHE_MS,
		30_000,
	);
	const blockedCache = new Map<string, number>();
	const ttlConfirmedKeys = new Set<string>();
	let ttlConfirmedDay: string | null = null;

	async function consume(
		scope: VerificationCounterScope,
		id: string,
		plan: PlanTier,
	): Promise<DailyVerificationConsumeResult> {
		const limit = limitForScope(scope, plan, env);
		const nowMs = now();
		const day = dayKey(nowMs);
		ttlConfirmedDay = rotateConfirmedKeyWindow({
			confirmedKeys: ttlConfirmedKeys,
			activeDay: ttlConfirmedDay,
			currentDay: day,
		});
		const safeId = id.trim() || "unknown";
		const blockedKey = `${scope}:${safeId}:${day}`;
		const blockedUntil = blockedCache.get(blockedKey);
		if (blockedUntil && blockedUntil > nowMs) {
			return {
				allowed: false,
				limit,
				used: limit,
				remaining: 0,
				backend: upstash ? "upstash" : "memory",
			};
		}
		if (!upstash) {
			return memoryConsume(usageByCounter, `${scope}:${safeId}`, day, limit);
		}

		const key = counterKey(scope, safeId, day);
		const used = await upstashIncrement(
			key,
			upstash,
			fetchImpl,
			upstashTimeoutMs,
		);
		if (used !== null) {
			if (!ttlConfirmedKeys.has(key)) {
				const expiryConfirmed = await upstashEnsureExpiry(
					key,
					upstash,
					fetchImpl,
					upstashTimeoutMs,
				);
				if (expiryConfirmed) {
					ttlConfirmedKeys.add(key);
				}
			}
			const result: DailyVerificationConsumeResult = {
				allowed: used <= limit,
				limit,
				used,
				remaining: Math.max(0, limit - used),
				backend: "upstash",
			};
			if (!result.allowed) {
				blockedCache.set(blockedKey, nowMs + blockedCacheMs);
			} else {
				blockedCache.delete(blockedKey);
			}
			return result;
		}

		if (!allowMemoryFallback) {
			blockedCache.set(blockedKey, nowMs + blockedCacheMs);
			return {
				allowed: false,
				limit,
				used: limit,
				remaining: 0,
				backend: "upstash",
			};
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

export function createSubjectPlanCache(options: SubjectPlanCacheOptions = {}) {
	const bySubject = new Map<string, PlanCacheEntry>();
	const now = options.nowMs ?? (() => Date.now());
	const ttlMs = readPositiveMs(options.ttlMs, 300_000);

	return {
		async resolve(
			subject: string,
			lookup: () => Promise<PlanTier>,
		): Promise<PlanTier> {
			const current = now();
			const cached = bySubject.get(subject);
			if (cached && cached.expiresAt > current) {
				return cached.plan;
			}

			const plan = await lookup();
			bySubject.set(subject, { plan, expiresAt: current + ttlMs });
			return plan;
		},
		reset(): void {
			bySubject.clear();
		},
	};
}
