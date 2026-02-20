import { describe, expect, test } from "bun:test";
import {
	createRateLimiter,
	InMemoryRateLimiter,
	UpstashRateLimiter,
} from "./rate-limiter";

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

describe("UpstashRateLimiter", () => {
	test("returns a best-effort allow decision when Redis fails and failClosed=false", async () => {
		const limiter = new UpstashRateLimiter({
			windowMs: 1000,
			maxRequests: 10,
			failClosed: false,
			limiterClient: {
				limit: async () => {
					throw new Error("network");
				},
			},
		});

		const result = await limiter.consume("k1", 0);
		expect(result.allowed).toBe(true);
		expect(result.retryAfterMs).toBe(0);
	});

	test("blocks when Redis fails and failClosed=true", async () => {
		const limiter = new UpstashRateLimiter({
			windowMs: 2000,
			maxRequests: 5,
			failClosed: true,
			limiterClient: {
				limit: async () => {
					throw new Error("network");
				},
			},
		});

		const result = await limiter.consume("k1", 100);
		expect(result.allowed).toBe(false);
		expect(result.retryAfterMs).toBe(2000);
		expect(result.limit).toBe(5);
		expect(result.remaining).toBe(0);
	});
});

describe("createRateLimiter", () => {
	test("uses in-memory limiter when Upstash env vars are missing", () => {
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
