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

	test("uses an injected usage ledger for idempotent accepted tool-call charging", async () => {
		const charges: Array<{ idempotencyKey: string; units: number }> = [];
		const limiter = createMcpUsageLimiter({
			nowMs: () => Date.UTC(2026, 1, 27, 12, 0, 0),
			controlPlane: {
				readKeyUsage: async () => ({
					total: 0,
					thisPeriod: 0,
					lastUsedAt: null,
					lastUsedProviderId: null,
					lastUsedModelId: null,
					backend: "none" as const,
				}),
				consumeAcceptedToolCalls: async (input) => {
					charges.push({
						idempotencyKey: input.idempotencyKey,
						units: input.units,
					});
					return {
						allowed: true,
						limit: 25_000,
						usedThisPeriod: 3,
						remaining: 24_997,
						period: "2026-02",
						backend: "memory" as const,
					};
				},
			},
		});

		const result = await limiter.consume({
			subjectId: "user_incrby",
			keyId: "key_incrby",
			plan: "solo",
			mcpPeriodLimit: 25_000,
			units: 3,
			idempotencyKey: "tool-call-123",
		});

		expect(result.allowed).toBe(true);
		expect(result.backend).toBe("memory");
		expect(result.usedThisPeriod).toBe(3);
		expect(charges).toEqual([{ idempotencyKey: "tool-call-123", units: 3 }]);
	});

	test("checks durable usage without charging until the accepted tool call is committed", async () => {
		const charges: string[] = [];
		const limiter = createMcpUsageLimiter({
			nowMs: () => Date.UTC(2026, 1, 27, 12, 0, 0),
			env: {
				NODE_ENV: "production",
				BARDO_MCP_USAGE_LIMIT_ALLOW_MEMORY_FALLBACK: "false",
			},
			controlPlane: {
				readKeyUsage: async () => ({
					total: 12,
					thisPeriod: 2,
					lastUsedAt: null,
					lastUsedProviderId: null,
					lastUsedModelId: null,
					backend: "none" as const,
				}),
				consumeAcceptedToolCalls: async (input) => {
					charges.push(input.idempotencyKey);
					return {
						allowed: true,
						limit: 25_000,
						usedThisPeriod: 3,
						remaining: 24_997,
						period: "2026-02",
						backend: "memory" as const,
					};
				},
			},
		});

		const check = await limiter.check({
			subjectId: "user_check",
			keyId: "key_check",
			plan: "solo",
			mcpPeriodLimit: 25_000,
			units: 1,
			idempotencyKey: "accepted-tool-call-1",
		});
		expect(check.allowed).toBe(true);
		expect(check.usedThisPeriod).toBe(2);
		expect(charges).toEqual([]);

		const consumed = await limiter.consume({
			subjectId: "user_check",
			keyId: "key_check",
			plan: "solo",
			mcpPeriodLimit: 25_000,
			units: 1,
			idempotencyKey: "accepted-tool-call-1",
		});
		expect(consumed.allowed).toBe(true);
		expect(charges).toEqual(["accepted-tool-call-1"]);
	});

	test("fails closed when durable metering is unavailable and memory fallback is disabled", async () => {
		const limiter = createMcpUsageLimiter({
			nowMs: () => Date.UTC(2026, 1, 27, 12, 0, 0),
			env: {
				NODE_ENV: "production",
				BARDO_MCP_USAGE_LIMIT_ALLOW_MEMORY_FALLBACK: "false",
			},
			controlPlane: null,
		});

		const result = await limiter.consume({
			subjectId: "user_prod",
			keyId: "key_prod",
			plan: "solo",
			mcpPeriodLimit: 25_000,
			units: 1,
			idempotencyKey: "tool-call-prod-1",
		});

		expect(result.allowed).toBe(false);
		expect(result.limit).toBe(25_000);
		expect(result.usedThisPeriod).toBe(25_000);
		expect(result.remaining).toBe(0);
		expect(result.period).toBe("2026-02");
		expect(result.backend).toBe("none");
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
