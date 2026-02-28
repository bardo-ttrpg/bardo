import { describe, expect, test } from "bun:test";
import { createMcpUsageLimiter } from "./mcp-usage-limiter";

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
});
