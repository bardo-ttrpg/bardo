import { describe, expect, test } from "bun:test";
import {
	createDailyVerificationBudgetLimiter,
	createSubjectPlanCache,
	pruneDailyVerificationCaches,
	rotateConfirmedKeyWindow,
} from "./api-key-verification-policy";

describe("createDailyVerificationBudgetLimiter", () => {
	test("enforces per-user cap for Pro accounts", async () => {
		let now = new Date("2026-02-26T10:00:00.000Z").getTime();
		const limiter = createDailyVerificationBudgetLimiter({
			nowMs: () => now,
		});

		const first = await limiter.consumeUser("user_a", "pro");
		expect(first.allowed).toBe(true);
		expect(first.used).toBe(1);
		expect(first.limit).toBe(7_500);
		expect(first.remaining).toBe(7_499);

		for (let i = 0; i < 7_499; i += 1) {
			await limiter.consumeUser("user_a", "pro");
		}

		const blocked = await limiter.consumeUser("user_a", "pro");
		expect(blocked.allowed).toBe(false);
		expect(blocked.used).toBe(7_500);
		expect(blocked.remaining).toBe(0);

		now = new Date("2026-02-27T00:00:00.000Z").getTime();
		const reset = await limiter.consumeUser("user_a", "pro");
		expect(reset.allowed).toBe(true);
		expect(reset.used).toBe(1);
		expect(reset.remaining).toBe(7_499);
	});

	test("blocks the hidden free fallback tier immediately", async () => {
		const limiter = createDailyVerificationBudgetLimiter();
		const result = await limiter.consumeUser("user_free", "free");

		expect(result.allowed).toBe(false);
		expect(result.limit).toBe(0);
		expect(result.used).toBe(0);
		expect(result.remaining).toBe(0);
	});

	test("enforces per-key cap independently from user cap", async () => {
		const limiter = createDailyVerificationBudgetLimiter();
		const free = await limiter.consumeKey("free_key", "free");
		const pro = await limiter.consumeKey("pro_key", "pro");
		expect(free.limit).toBe(0);
		expect(pro.limit).toBe(2_000);
	});

	test("uses the injected limiter when configured", async () => {
		const controlPlane = {
			consumeRateLimitWindow: async () => ({
				allowed: true,
				remaining: 499,
				retryAfterSeconds: 0,
				resetEpochSeconds: 1_772_192_400,
			}),
		};
		const limiter = createDailyVerificationBudgetLimiter({
			env: { NODE_ENV: "production" },
			controlPlane,
		});

		const result = await limiter.consumeUser("user_remote", "pro");
		expect(result.backend).toBe("website");
		expect(result.allowed).toBe(true);
		expect(result.used).toBe(7_001);
		expect(result.remaining).toBe(499);
	});

	test("falls back to memory when the control plane is unavailable and fallback is allowed", async () => {
		const controlPlane = {
			consumeRateLimitWindow: async () => {
				throw new Error("transient control plane failure");
			},
		};
		const limiter = createDailyVerificationBudgetLimiter({
			env: {
				NODE_ENV: "development",
				BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK: "true",
			},
			controlPlane,
		});

		const first = await limiter.consumeUser("user_retry", "pro");
		const second = await limiter.consumeUser("user_retry", "pro");

		expect(first.allowed).toBe(true);
		expect(second.allowed).toBe(true);
		expect(first.backend).toBe("memory");
		expect(second.backend).toBe("memory");
	});

	test("clears confirmed ttl keys when the day window changes", () => {
		const confirmedKeys = new Set([
			"bardo:verify:user:user_a:2026-02-26",
			"bardo:verify:key:key_a:2026-02-26",
		]);

		const currentDay = rotateConfirmedKeyWindow({
			confirmedKeys,
			activeDay: "2026-02-26",
			currentDay: "2026-02-27",
		});

		expect(currentDay).toBe("2026-02-27");
		expect([...confirmedKeys]).toEqual([]);
	});

	test("prunes stale memory counters and expired blocked cache entries", () => {
		const usageByCounter = new Map([
			["user:active", { day: "2026-02-27", used: 10 }],
			["user:stale", { day: "2026-02-26", used: 20 }],
			["key:stale", { day: "2026-02-25", used: 5 }],
		]);
		const blockedCache = new Map([
			["key:expired", Date.UTC(2026, 1, 27, 0, 0, 0)],
			["key:active", Date.UTC(2026, 1, 27, 0, 10, 0)],
		]);

		pruneDailyVerificationCaches({
			usageByCounter,
			blockedCache,
			currentDay: "2026-02-27",
			nowMs: Date.UTC(2026, 1, 27, 0, 5, 0),
		});

		expect([...usageByCounter.keys()]).toEqual(["user:active"]);
		expect([...blockedCache.keys()]).toEqual(["key:active"]);
	});
});

describe("createSubjectPlanCache", () => {
	test("caches lookup result until ttl expires", async () => {
		let now = 1000;
		const cache = createSubjectPlanCache({
			ttlMs: 10_000,
			nowMs: () => now,
		});
		let lookups = 0;

		const lookup = async () => {
			lookups += 1;
			return "pro";
		};

		const first = await cache.resolve("user_1", lookup);
		const second = await cache.resolve("user_1", lookup);
		expect(first).toBe("pro");
		expect(second).toBe("pro");
		expect(lookups).toBe(1);

		now = 20_000;
		const third = await cache.resolve("user_1", lookup);
		expect(third).toBe("pro");
		expect(lookups).toBe(2);
	});
});
