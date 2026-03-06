import { describe, expect, test } from "bun:test";
import {
	createDailyVerificationBudgetLimiter,
	createSubjectPlanCache,
	pruneDailyVerificationCaches,
	rotateConfirmedKeyWindow,
} from "./api-key-verification-policy";

describe("createDailyVerificationBudgetLimiter", () => {
	test("enforces per-user cap", async () => {
		let now = new Date("2026-02-26T10:00:00.000Z").getTime();
		const limiter = createDailyVerificationBudgetLimiter({
			nowMs: () => now,
		});

		const first = await limiter.consumeUser("user_a", "free");
		expect(first.allowed).toBe(true);
		expect(first.used).toBe(1);
		expect(first.limit).toBe(500);
		expect(first.remaining).toBe(499);

		for (let i = 0; i < 499; i += 1) {
			await limiter.consumeUser("user_a", "free");
		}

		const blocked = await limiter.consumeUser("user_a", "free");
		expect(blocked.allowed).toBe(false);
		expect(blocked.used).toBe(500);
		expect(blocked.remaining).toBe(0);

		now = new Date("2026-02-27T00:00:00.000Z").getTime();
		const reset = await limiter.consumeUser("user_a", "free");
		expect(reset.allowed).toBe(true);
		expect(reset.used).toBe(1);
		expect(reset.remaining).toBe(499);
	});

	test("enforces per-key cap independently from user cap", async () => {
		const limiter = createDailyVerificationBudgetLimiter();
		const free = await limiter.consumeKey("free_key", "free");
		const solo = await limiter.consumeKey("solo_key", "solo");
		expect(free.limit).toBe(500);
		expect(solo.limit).toBe(2_000);
	});

	test("uses upstash backend when configured", async () => {
		const counters = new Map();
		const fetchImpl = async (input) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/incr/")) {
				const encodedKey = url.slice(url.indexOf("/incr/") + "/incr/".length);
				const key = decodeURIComponent(encodedKey);
				const next = (counters.get(key) ?? 0) + 1;
				counters.set(key, next);
				return new Response(JSON.stringify({ result: next }), { status: 200 });
			}
			return new Response(JSON.stringify({ result: 1 }), { status: 200 });
		};
		const limiter = createDailyVerificationBudgetLimiter({
			env: {
				NODE_ENV: "production",
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "token",
			},
			fetchImpl,
		});

		const result = await limiter.consumeUser("user_upstash", "free");
		expect(result.backend).toBe("upstash");
		expect(result.allowed).toBe(true);
		expect(result.used).toBe(1);
	});

	test("retries Upstash expiry until it succeeds", async () => {
		const counters = new Map();
		let expireCalls = 0;
		const fetchImpl = async (input) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/incr/")) {
				const encodedKey = url.slice(url.indexOf("/incr/") + "/incr/".length);
				const key = decodeURIComponent(encodedKey);
				const next = (counters.get(key) ?? 0) + 1;
				counters.set(key, next);
				return new Response(JSON.stringify({ result: next }), { status: 200 });
			}
			if (url.includes("/expire/")) {
				expireCalls += 1;
				if (expireCalls === 1) {
					throw new Error("transient expire failure");
				}
				return new Response(JSON.stringify({ result: 1 }), { status: 200 });
			}
			throw new Error(`unexpected url: ${url}`);
		};
		const limiter = createDailyVerificationBudgetLimiter({
			env: {
				NODE_ENV: "production",
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "token",
			},
			fetchImpl,
		});

		const first = await limiter.consumeUser("user_upstash_retry", "free");
		const second = await limiter.consumeUser("user_upstash_retry", "free");

		expect(first.allowed).toBe(true);
		expect(second.allowed).toBe(true);
		expect(expireCalls).toBe(2);
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
			return "solo";
		};

		const first = await cache.resolve("user_1", lookup);
		const second = await cache.resolve("user_1", lookup);
		expect(first).toBe("solo");
		expect(second).toBe("solo");
		expect(lookups).toBe(1);

		now = 20_000;
		const third = await cache.resolve("user_1", lookup);
		expect(third).toBe("solo");
		expect(lookups).toBe(2);
	});
});
