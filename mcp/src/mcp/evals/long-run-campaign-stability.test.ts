import { describe, expect, test } from "bun:test";
import { runLongRunCampaignStabilityEval } from "./long-run-campaign-stability";

describe("long-run campaign stability eval", () => {
	test("passes a strict 25+ turn stability run with replay consistency", async () => {
		const result = await runLongRunCampaignStabilityEval({
			turnCount: 25,
			retryInjection: true,
		});

		expect(result.success).toBe(true);
		expect(result.turnCount).toBe(25);
		expect(result.failedTurns).toBe(0);
		expect(result.turnResults.length).toBe(25);
		expect(result.replayConsistency.stable).toBe(true);
		expect(result.invariantFailures.actionFailed).toBe(0);
		expect(result.invariantFailures.eventGrowthViolation).toBe(0);
		expect(result.invariantFailures.projectionDrift).toBe(0);
		expect(result.invariantFailures.replayEventDrift).toBe(0);
		expect(result.invariantFailures.replayProjectionDrift).toBe(0);
		expect(result.invariantFailures.eventOrderingDrift).toBe(0);
		expect(
			result.invariantFailures.partialCanonicalStateAfterRetryFailure,
		).toBe(0);
		expect(result.retryInjection.enabled).toBe(true);
		expect(result.retryInjection.injectedTurns).toBeGreaterThan(0);
		expect(result.retryInjection.partialStateViolations).toBe(0);
	});

	test("supports higher turn count runs", async () => {
		const result = await runLongRunCampaignStabilityEval({
			turnCount: 30,
			retryInjection: false,
		});

		expect(result.success).toBe(true);
		expect(result.turnCount).toBe(30);
		expect(result.turnResults.length).toBe(30);
		expect(result.replayConsistency.stable).toBe(true);
		expect(result.retryInjection.enabled).toBe(false);
		expect(result.eventOrderingLogs.length).toBe(30);
	});
});
