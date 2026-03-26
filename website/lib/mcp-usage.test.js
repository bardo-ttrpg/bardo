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
	test("returns usage snapshot from an injected reader", async () => {
		const controlPlane = {
			readUserUsage: async () => ({
				total: 42,
				thisPeriod: 12,
				backend: "none",
			}),
			readKeyUsage: async () => ({
				total: 0,
				thisPeriod: 0,
				lastUsedAt: null,
				lastUsedProviderId: null,
				lastUsedModelId: null,
				backend: "none",
			}),
		};
		const reader = createMcpUsageReader({
			controlPlane,
		});

		const usage = await reader.readUserUsage({
			subjectId: "user_1",
			periodStartMs: Date.UTC(2026, 1, 1),
		});

		expect(usage.total).toBe(42);
		expect(usage.thisPeriod).toBe(12);
		expect(usage.backend).toBe("none");
	});

	test("returns a zeroed snapshot when the control plane is unavailable", async () => {
		const reader = createMcpUsageReader({
			controlPlane: null,
		});

		const usage = await reader.readUserUsage({
			subjectId: "user_2",
			periodStartMs: Date.UTC(2026, 1, 1),
		});

		expect(usage.total).toBe(0);
		expect(usage.thisPeriod).toBe(0);
		expect(usage.backend).toBe("none");
	});
});
