import { describe, expect, test } from "bun:test";
import { createRateLimiter, InMemoryRateLimiter } from "./rate-limiter";

describe("InMemoryRateLimiter", () => {
	test("allows requests within the configured window limit", () => {
		const limiter = new InMemoryRateLimiter({
			windowMs: 1000,
			maxRequests: 2,
		});

		expect(limiter.consume("k1", 0).allowed).toBe(true);
		expect(limiter.consume("k1", 100).allowed).toBe(true);
	});

	test("rejects requests above limit and reports retryAfterMs", () => {
		const limiter = new InMemoryRateLimiter({
			windowMs: 1000,
			maxRequests: 2,
		});

		limiter.consume("k1", 0);
		limiter.consume("k1", 100);
		const blocked = limiter.consume("k1", 200);

		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfterMs).toBe(800);
	});

	test("resets counters when window passes", () => {
		const limiter = new InMemoryRateLimiter({
			windowMs: 1000,
			maxRequests: 1,
		});

		expect(limiter.consume("k1", 0).allowed).toBe(true);
		expect(limiter.consume("k1", 10).allowed).toBe(false);
		expect(limiter.consume("k1", 1001).allowed).toBe(true);
	});
});

describe("createRateLimiter", () => {
	test("uses the in-memory limiter", () => {
		const limiter = createRateLimiter(
			{
				windowMs: 1000,
				maxRequests: 3,
				failClosed: false,
			},
			{},
		);
		expect(limiter.kind).toBe("memory");
	});
});
