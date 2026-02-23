import { describe, expect, test } from "bun:test";
import {
	GOLDEN_SCENARIO_IDS,
	runGoldenScenarioSuite,
} from "./golden-scenarios";

describe("golden scenario eval harness", () => {
	test("runs the full golden scenario suite", async () => {
		const result = await runGoldenScenarioSuite({});
		expect(result.total).toBe(GOLDEN_SCENARIO_IDS.length);
		expect(result.failed).toBe(0);
		expect(result.passed).toBe(result.total);
		expect(result.results.every((entry) => entry.success)).toBe(true);
	});

	test("runs a targeted scenario subset", async () => {
		const result = await runGoldenScenarioSuite({
			scenarioIds: ["combat_exchange", "idempotent_replay_integrity"],
		});
		expect(result.total).toBe(2);
		expect(result.failed).toBe(0);
		expect(result.results.map((entry) => entry.id)).toEqual([
			"combat_exchange",
			"idempotent_replay_integrity",
		]);
	});

	test("includes deterministic canonical event trace details", async () => {
		const result = await runGoldenScenarioSuite({
			scenarioIds: [
				"combat_exchange",
				"safety_boundary_block",
				"idempotent_replay_integrity",
				"legacy_state_migration",
				"unsupported_action_rejected",
				"narrative_ruleset_resolution",
				"stacked_condition_resolution",
				"event_ordering_stress",
			],
		});
		expect(result.failed).toBe(0);

		const traceByScenario = new Map(
			result.results.map((entry) => [
				entry.id,
				(entry.details.eventTypes as string[] | undefined) ?? [],
			]),
		);
		expect(traceByScenario.get("combat_exchange")).toEqual([
			"player_action_declared",
			"action_intent_validated",
			"dice_rolled",
			"mechanics_resolved",
			"player_action_resolved",
		]);
		expect(traceByScenario.get("safety_boundary_block")).toEqual([
			"runtime_policy_blocked",
		]);
		expect(traceByScenario.get("idempotent_replay_integrity")).toEqual([
			"player_action_declared",
			"action_intent_validated",
			"player_action_resolved",
		]);
		expect(traceByScenario.get("legacy_state_migration")).toEqual([
			"legacy_state_migrated",
		]);
		expect(traceByScenario.get("unsupported_action_rejected")).toEqual([]);
		expect(traceByScenario.get("narrative_ruleset_resolution")).toEqual([
			"player_action_declared",
			"action_intent_validated",
			"mechanics_resolved",
			"player_action_resolved",
		]);
		expect(traceByScenario.get("stacked_condition_resolution")).toEqual([
			"player_action_declared",
			"action_intent_validated",
			"dice_rolled",
			"mechanics_resolved",
			"player_action_resolved",
		]);
		const orderingStressTrace =
			traceByScenario.get("event_ordering_stress") ?? [];
		expect(orderingStressTrace.length).toBeGreaterThan(10);
	});
});
