import { describe, expect, test } from "bun:test";
import {
	createMcpUsageLimiter,
	pruneUsageLimiterCaches,
} from "./mcp-usage-limiter";

describe("createMcpUsageLimiter", () => {
	test("allows requests under the plan period limit and tracks usage", async () => {
		const limiter = createMcpUsageLimiter({
			nowMs: () => Date.UTC(2026, 1, 27, 12, 0, 0),
			env: {},
		});

		const first = await limiter.consume({
			subjectId: "user_123",
			keyId: "key_123",
			plan: "free",
			mcpPeriodLimit: 2,
		});
		expect(first.allowed).toBe(true);
		expect(first.usedThisPeriod).toBe(1);
		expect(first.remaining).toBe(1);

		const second = await limiter.consume({
			subjectId: "user_123",
			keyId: "key_123",
			plan: "free",
			mcpPeriodLimit: 2,
		});
		expect(second.allowed).toBe(true);
		expect(second.usedThisPeriod).toBe(2);
		expect(second.remaining).toBe(0);
	});

	test("blocks requests when period limit is exceeded", async () => {
		const limiter = createMcpUsageLimiter({
			nowMs: () => Date.UTC(2026, 1, 27, 12, 0, 0),
			env: {},
		});

		await limiter.consume({
			subjectId: "user_abc",
			keyId: "key_abc",
			plan: "solo",
			mcpPeriodLimit: 1,
		});

		const blocked = await limiter.consume({
			subjectId: "user_abc",
			keyId: "key_abc",
			plan: "solo",
			mcpPeriodLimit: 1,
		});
		expect(blocked.allowed).toBe(false);
		expect(blocked.limit).toBe(1);
		expect(blocked.usedThisPeriod).toBe(2);
		expect(blocked.remaining).toBe(0);
	});

	test("skips accounting when identity metadata is not present", async () => {
		const limiter = createMcpUsageLimiter({
			nowMs: () => Date.UTC(2026, 1, 27, 12, 0, 0),
			env: {},
		});

		const result = await limiter.consume({
			subjectId: null,
			keyId: null,
			plan: null,
			mcpPeriodLimit: null,
		});
		expect(result.allowed).toBe(true);
		expect(result.limit).toBeNull();
		expect(result.usedThisPeriod).toBeNull();
		expect(result.remaining).toBeNull();
	});

	test("uses INCRBY for multi-unit Upstash increments instead of per-unit INCR loops", async () => {
		const counters = new Map<string, number>();
		const incrbyCalls: Array<{ key: string; by: number }> = [];
		const limiter = createMcpUsageLimiter({
			nowMs: () => Date.UTC(2026, 1, 27, 12, 0, 0),
			env: {
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "token",
				BARDO_MCP_USAGE_LIMIT_ALLOW_MEMORY_FALLBACK: "false",
				BARDO_MCP_USAGE_WRITE_TOTALS: "true",
			},
			redis: {
				incr: async () => {
					throw new Error("INCR should not be used for unit-based accounting.");
				},
				incrby: async (key: string, by: number) => {
					incrbyCalls.push({ key, by });
					const next = (counters.get(key) ?? 0) + by;
					counters.set(key, next);
					return next;
				},
				expire: async () => 1,
				set: async () => "OK",
			} as never,
		});

		const result = await limiter.consume({
			subjectId: "user_incrby",
			keyId: "key_incrby",
			plan: "solo",
			mcpPeriodLimit: 25_000,
			units: 3,
		});

		expect(result.allowed).toBe(true);
		expect(result.backend).toBe("upstash");
		expect(result.usedThisPeriod).toBe(3);
		expect(incrbyCalls.some((entry) => entry.by === 3)).toBe(true);
		expect(
			incrbyCalls.filter((entry) => entry.key.includes(":month:")).length,
		).toBe(2);
		expect(
			incrbyCalls.filter((entry) => entry.key.endsWith(":total")).length,
		).toBe(2);
	});

	test("prunes stale in-memory counters and expired block-cache entries", () => {
		const userMemory = new Map([
			["user_active", { period: "2026-02", used: 12 }],
			["user_stale", { period: "2026-01", used: 9 }],
		]);
		const keyMemory = new Map([
			["key_active", { period: "2026-02", used: 4 }],
			["key_stale", { period: "2025-12", used: 8 }],
		]);
		const blockedCache = new Map([
			["user_active:2026-02", Date.UTC(2026, 1, 27, 0, 10, 0)],
			["user_stale:2026-01", Date.UTC(2026, 1, 27, 0, 0, 0)],
		]);

		pruneUsageLimiterCaches({
			userMemory,
			keyMemory,
			blockedCache,
			period: "2026-02",
			nowMs: Date.UTC(2026, 1, 27, 0, 5, 0),
		});

		expect([...userMemory.keys()]).toEqual(["user_active"]);
		expect([...keyMemory.keys()]).toEqual(["key_active"]);
		expect([...blockedCache.keys()]).toEqual(["user_active:2026-02"]);
	});
});
