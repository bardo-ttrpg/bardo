import { describe, expect, test } from "bun:test";
import {
	evaluateReplayInvariants,
	evaluateTurnInvariants,
} from "./campaign-invariants";

describe("campaign invariants", () => {
	test("detects turn invariant failures", () => {
		const evaluation = evaluateTurnInvariants({
			actionSuccess: false,
			previousEventCount: 5,
			currentEventCount: 5,
			projectionState: { currentLocation: "market" },
			derivedState: { currentLocation: "docks" },
		});

		expect(evaluation.success).toBe(false);
		expect(evaluation.eventGrowthOk).toBe(false);
		expect(evaluation.projectionConsistent).toBe(false);
		expect(evaluation.failures.actionFailed).toBe(true);
		expect(evaluation.failures.eventGrowthViolation).toBe(true);
		expect(evaluation.failures.projectionDrift).toBe(true);
	});

	test("detects replay invariant drift", () => {
		const evaluation = evaluateReplayInvariants({
			eventCountBeforeReplay: 31,
			eventCountAfterReplay: 33,
			projectionBeforeReplay: {
				currentLocation: "market",
				worldTimeISO: "2026-02-23T00:10:00.000Z",
			},
			projectionAfterReplay: {
				currentLocation: "market",
				worldTimeISO: "2026-02-23T00:20:00.000Z",
			},
		});

		expect(evaluation.stable).toBe(false);
		expect(evaluation.replayStable).toBe(false);
		expect(evaluation.projectionStable).toBe(false);
		expect(evaluation.failures.replayEventDrift).toBe(true);
		expect(evaluation.failures.replayProjectionDrift).toBe(true);
	});
});
