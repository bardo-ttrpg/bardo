import { describe, expect, test } from "bun:test";
import { runRuntimeEvalScenario } from "./runtime-evals";

describe("runtime eval harness", () => {
	test("runs missing campaign state scenario with machine-readable metrics", async () => {
		const result = await runRuntimeEvalScenario("missing_campaign_state");
		expect(result.scenarioId).toBe("missing_campaign_state");
		expect(typeof result.metrics.blockedInvalidCommitCount).toBe("number");
		expect(typeof result.metrics.replayHashConverged).toBe("boolean");
	});

	test("runs contradictory sources scenario", async () => {
		const result = await runRuntimeEvalScenario("contradictory_sources");
		expect(result.scenarioId).toBe("contradictory_sources");
		expect(Array.isArray(result.notes)).toBe(true);
	});

	test("runs explicit correction repair scenario", async () => {
		const result = await runRuntimeEvalScenario("explicit_correction_repair");
		expect(result.metrics.correctionSurvived).toBe(true);
	});

	test("runs messy workspace extraction scenario", async () => {
		const result = await runRuntimeEvalScenario("messy_workspace_extraction");
		expect(typeof result.metrics.duplicateCandidateCount).toBe("number");
	});
});
