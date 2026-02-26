import { describe, expect, test } from "bun:test";
import {
	recordLongRunCampaignEvalMetric,
	renderPrometheusMetrics,
	resetTelemetryForTests,
} from "./index";

describe("long-run eval telemetry", () => {
	test("records invariant failures and replay drift dimensions", () => {
		resetTelemetryForTests();

		recordLongRunCampaignEvalMetric({
			outcome: "error",
			durationMs: 123,
			turnCount: 10,
			failedTurns: 2,
			invariantFailures: {
				actionFailed: 1,
				eventGrowthViolation: 0,
				projectionDrift: 1,
				replayEventDrift: 1,
				replayProjectionDrift: 0,
			},
			replayConsistency: {
				stable: false,
				eventCountBeforeReplay: 31,
				eventCountAfterReplay: 33,
				projectionStable: false,
			},
		});

		const metrics = renderPrometheusMetrics();
		expect(metrics).toContain("bardo_eval_long_run_runs_total");
		expect(metrics).toContain("bardo_eval_long_run_duration_ms_count");
		expect(metrics).toContain(
			'bardo_eval_long_run_invariant_failures_total{invariant="action_failed",outcome="error"} 1',
		);
		expect(metrics).toContain(
			'bardo_eval_long_run_invariant_failures_total{invariant="projection_drift",outcome="error"} 1',
		);
		expect(metrics).toContain(
			'bardo_eval_long_run_replay_drift_total{dimension="events"} 1',
		);
		expect(metrics).toContain(
			'bardo_eval_long_run_replay_drift_total{dimension="projection"} 1',
		);
	});
});
