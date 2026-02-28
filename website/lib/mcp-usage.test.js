import { describe, expect, test } from "bun:test";
import { createMcpUsageReader, listPeriodMonthBuckets } from "./mcp-usage";

describe("listPeriodMonthBuckets", () => {
	test("returns inclusive UTC month buckets from period start to now", () => {
		const buckets = listPeriodMonthBuckets(
			Date.UTC(2026, 0, 15),
			Date.UTC(2026, 2, 1),
		);
		expect(buckets).toEqual(["2026-01", "2026-02", "2026-03"]);
	});
});

describe("createMcpUsageReader", () => {
	test("returns usage snapshot from upstash counters", async () => {
		const calls = [];
		const fetchMock = async (input, init) => {
			calls.push({ input: String(input), init });
			const url = String(input);
			if (url.includes("/get/bardo%3Ausage%3Amcp%3Auser%3Auser_1%3Atotal")) {
				return new Response(JSON.stringify({ result: "42" }), { status: 200 });
			}
			if (
				url.includes(
					"/get/bardo%3Ausage%3Amcp%3Auser%3Auser_1%3Amonth%3A2026-02",
				)
			) {
				return new Response(JSON.stringify({ result: "12" }), { status: 200 });
			}
			return new Response(JSON.stringify({ result: null }), { status: 200 });
		};

		const reader = createMcpUsageReader({
			env: {
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "token",
				BARDO_MCP_USAGE_READ_TOTALS: "true",
			},
			fetchImpl: fetchMock,
			nowMs: () => Date.UTC(2026, 1, 27),
		});

		const usage = await reader.readUserUsage({
			subjectId: "user_1",
			periodStartMs: Date.UTC(2026, 1, 1),
		});

		expect(usage.total).toBe(42);
		expect(usage.thisPeriod).toBe(12);
		expect(calls.length).toBeGreaterThanOrEqual(2);
	});

	test("defaults total to period usage when total reads are disabled", async () => {
		const calls = [];
		const fetchMock = async (input, init) => {
			calls.push({ input: String(input), init });
			const url = String(input);
			if (
				url.includes(
					"/get/bardo%3Ausage%3Amcp%3Auser%3Auser_2%3Amonth%3A2026-02",
				)
			) {
				return new Response(JSON.stringify({ result: "7" }), { status: 200 });
			}
			return new Response(JSON.stringify({ result: null }), { status: 200 });
		};

		const reader = createMcpUsageReader({
			env: {
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "token",
				BARDO_MCP_USAGE_READ_TOTALS: "false",
			},
			fetchImpl: fetchMock,
			nowMs: () => Date.UTC(2026, 1, 27),
		});

		const usage = await reader.readUserUsage({
			subjectId: "user_2",
			periodStartMs: Date.UTC(2026, 1, 1),
		});

		expect(usage.total).toBe(7);
		expect(usage.thisPeriod).toBe(7);
		expect(calls.some((call) => call.input.includes("%3Atotal"))).toBe(false);
	});
});
