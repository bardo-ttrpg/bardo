import { describe, expect, test } from "bun:test";
import {
	renderPrometheusMetrics,
	resetTelemetryForTests,
} from "../../telemetry";
import { runOrchestratorStep } from "./turns-orchestrator-internal";

describe("runOrchestratorStep telemetry", () => {
	test("records successful step duration", async () => {
		resetTelemetryForTests();

		const value = await runOrchestratorStep({
			workflow: "turns_resolve",
			step: "player_action",
			fn: async () => "ok",
		});

		expect(value).toBe("ok");
		const text = renderPrometheusMetrics();
		expect(text).toContain("bardo_orchestrator_step_duration_ms_count");
		expect(text).toContain(
			'status="success",step="player_action",workflow="turns_resolve"',
		);
	});

	test("records error step duration", async () => {
		resetTelemetryForTests();

		await expect(
			runOrchestratorStep({
				workflow: "world_tick",
				step: "simulation_tick",
				fn: async () => {
					throw new Error("boom");
				},
			}),
		).rejects.toThrow("boom");

		const text = renderPrometheusMetrics();
		expect(text).toContain("bardo_orchestrator_step_duration_ms_count");
		expect(text).toContain(
			'status="error",step="simulation_tick",workflow="world_tick"',
		);
	});
});
