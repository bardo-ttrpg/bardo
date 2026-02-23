import { describe, expect, test } from "bun:test";
import { runPerformanceBenchmarkEval } from "./performance-benchmark";

describe("performance benchmark eval", () => {
	test("measures p95 latencies over a 1000+ event campaign fixture", async () => {
		const result = await runPerformanceBenchmarkEval({
			seedEvents: 1_000,
			sampleRuns: 20,
		});

		expect(result.seedEvents).toBeGreaterThanOrEqual(1_000);
		expect(result.indexRebuild.totalCalls).toBe(100);
		expect(result.p95.playerActionMs).toBeGreaterThanOrEqual(0);
		expect(result.p95.projectionRefreshMs).toBeGreaterThanOrEqual(0);
		expect(result.p95.retrievalMs).toBeGreaterThanOrEqual(0);
		expect(result.success).toBeTrue();
	});
});
