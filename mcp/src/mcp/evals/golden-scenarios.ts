import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readCanonicalEvents } from "../../domain/events/store";
import { renderMarkdown } from "../../domain/markdown/markdown";
import { migrateLegacyStateToCanonicalEvents } from "../../domain/migrations/legacy-state";
import { resolveBardoRoot } from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { parseIntent } from "../tools/player-action/parsing";
import { runPlayerAction } from "../tools/player-action/register";

export const GOLDEN_SCENARIO_IDS = [
	"combat_exchange",
	"safety_boundary_block",
	"idempotent_replay_integrity",
	"legacy_state_migration",
	"unsupported_action_rejected",
	"narrative_ruleset_resolution",
	"stacked_condition_resolution",
	"event_ordering_stress",
] as const;

export type GoldenScenarioId = (typeof GOLDEN_SCENARIO_IDS)[number];

export type GoldenScenarioResult = {
	id: GoldenScenarioId;
	success: boolean;
	message: string;
	details: Record<string, unknown>;
};

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function assertCondition(
	condition: unknown,
	message: string,
): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

function expectedEventTypesForAction(action: string): string[] {
	const intent = parseIntent(action);
	if (intent === "combat" || intent === "social") {
		return [
			"player_action_declared",
			"action_intent_validated",
			"dice_rolled",
			"mechanics_resolved",
			"player_action_resolved",
		];
	}
	return [
		"player_action_declared",
		"action_intent_validated",
		"player_action_resolved",
	];
}

function arraysEqual(left: string[], right: string[]): boolean {
	if (left.length !== right.length) {
		return false;
	}
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) {
			return false;
		}
	}
	return true;
}

async function withScenarioRoot<T>(
	prefix: string,
	run: (args: {
		root: string;
		bardoRoot: string;
		auth: AuthContext;
	}) => Promise<T>,
): Promise<T> {
	const root = await mkdtemp(path.join(os.tmpdir(), prefix));
	const bardoRoot = resolveBardoRoot(root);
	try {
		return await run({
			root,
			bardoRoot,
			auth: createAuth(root),
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

async function runCombatExchangeScenario(): Promise<GoldenScenarioResult> {
	return withScenarioRoot("bardo-golden-combat-", async (context) => {
		const action = await runPlayerAction({
			auth: context.auth,
			action: "I attack the bandit with my sword",
			idempotencyKey: "golden_combat_exchange_key",
			guidedSetupEnabled: false,
			nowIso: "2026-02-23T09:00:00.000Z",
		});
		assertCondition(action.success === true, "Combat action should succeed.");
		assertCondition(action.intent === "combat", "Combat intent expected.");
		assertCondition(
			action.mechanics.resolved,
			"Combat mechanics should resolve deterministically.",
		);

		const events = await readCanonicalEvents({ bardoRoot: context.bardoRoot });
		const eventTypes = events.map((event) => event.type);
		assertCondition(
			eventTypes.join(",") ===
				"player_action_declared,action_intent_validated,dice_rolled,mechanics_resolved,player_action_resolved",
			"Unexpected combat canonical event order.",
		);

		return {
			id: "combat_exchange",
			success: true,
			message: "Combat exchange scenario passed.",
			details: {
				eventTypes,
				outcome: action.mechanics.outcome,
				total: action.mechanics.total,
			},
		};
	});
}

async function runSafetyBoundaryBlockScenario(): Promise<GoldenScenarioResult> {
	return withScenarioRoot("bardo-golden-safety-", async (context) => {
		await mkdir(path.join(context.bardoRoot, "manifests"), {
			recursive: true,
		});
		await writeFile(
			path.join(context.bardoRoot, "manifests/table-contract.json"),
			JSON.stringify(
				{
					boundaries: {
						lines: ["graphic gore"],
						veils: [],
					},
				},
				null,
				2,
			),
			"utf8",
		);

		const action = await runPlayerAction({
			auth: context.auth,
			action: "I describe graphic gore in explicit detail.",
			idempotencyKey: "golden_safety_boundary_key",
			guidedSetupEnabled: false,
			nowIso: "2026-02-23T10:00:00.000Z",
		});
		assertCondition(
			action.success === false,
			"Boundary action should be blocked.",
		);
		assertCondition(
			action.message.toLowerCase().includes("blocked"),
			"Blocked action should explain policy rejection.",
		);

		const events = await readCanonicalEvents({ bardoRoot: context.bardoRoot });
		assertCondition(
			events.length === 1,
			"Only policy blocked event should exist.",
		);
		assertCondition(
			events[0]?.type === "runtime_policy_blocked",
			"runtime_policy_blocked event expected.",
		);

		return {
			id: "safety_boundary_block",
			success: true,
			message: "Safety boundary scenario passed.",
			details: {
				eventType: events[0]?.type ?? null,
				eventTypes: events.map((event) => event.type),
			},
		};
	});
}

async function runIdempotentReplayIntegrityScenario(): Promise<GoldenScenarioResult> {
	return withScenarioRoot("bardo-golden-replay-", async (context) => {
		const first = await runPlayerAction({
			auth: context.auth,
			action: "I explore the market lane",
			idempotencyKey: "golden_replay_key",
			guidedSetupEnabled: false,
			nowIso: "2026-02-23T11:00:00.000Z",
		});
		const second = await runPlayerAction({
			auth: context.auth,
			action: "I explore the market lane",
			idempotencyKey: "golden_replay_key",
			guidedSetupEnabled: false,
			nowIso: "2026-02-23T11:00:01.000Z",
		});

		assertCondition(first.success === true, "First action should succeed.");
		assertCondition(second.success === true, "Replay action should succeed.");
		assertCondition(second.idempotentReplay, "Second action should replay.");
		assertCondition(
			first.historyEntry === second.historyEntry,
			"Idempotent replay should return stable action summary.",
		);

		const events = await readCanonicalEvents({ bardoRoot: context.bardoRoot });
		const eventTypes = events.map((event) => event.type);
		assertCondition(
			eventTypes.join(",") ===
				"player_action_declared,action_intent_validated,player_action_resolved",
			"Replay should not duplicate canonical events for non-combat action.",
		);

		return {
			id: "idempotent_replay_integrity",
			success: true,
			message: "Idempotent replay integrity scenario passed.",
			details: {
				eventTypes,
				canonicalEvents: events.length,
				idempotentReplay: second.idempotentReplay,
			},
		};
	});
}

async function runLegacyStateMigrationScenario(): Promise<GoldenScenarioResult> {
	return withScenarioRoot("bardo-golden-migration-", async (context) => {
		const statePath = path.join(context.bardoRoot, "state/current.md");
		await mkdir(path.dirname(statePath), { recursive: true });
		await writeFile(
			statePath,
			renderMarkdown(
				{
					title: "Campaign State",
					description: "Legacy state snapshot",
				},
				JSON.stringify(
					{
						worldTimeISO: "2026-02-23T12:00:00.000Z",
						currentLocation: "river-market",
						counters: {
							unknownNpc: 0,
							unknownLocation: 0,
						},
						locations: {
							"river-market": {
								name: "River Market",
								visits: 1,
								npcIds: [],
							},
						},
						lastAction: "legacy-action",
					},
					null,
					2,
				),
			),
			"utf8",
		);

		const migration = await migrateLegacyStateToCanonicalEvents({
			bardoRoot: context.bardoRoot,
			nowIso: "2026-02-23T12:10:00.000Z",
			dryRun: false,
			idempotencyKey: "golden_legacy_migration_key",
		});
		assertCondition(migration.migrated, "Legacy migration should run.");
		assertCondition(
			migration.canonicalEventsAfter === 1,
			"Legacy migration should append a single canonical migration event.",
		);

		const events = await readCanonicalEvents({ bardoRoot: context.bardoRoot });
		assertCondition(
			events[0]?.type === "legacy_state_migrated",
			"Expected legacy_state_migrated canonical event.",
		);

		return {
			id: "legacy_state_migration",
			success: true,
			message: "Legacy migration scenario passed.",
			details: {
				eventType: events[0]?.type ?? null,
				eventTypes: events.map((event) => event.type),
				canonicalEvents: events.length,
			},
		};
	});
}

async function runUnsupportedActionRejectedScenario(): Promise<GoldenScenarioResult> {
	return withScenarioRoot("bardo-golden-unsupported-", async (context) => {
		const previousRuleset = Bun.env.BARDO_DEFAULT_RULESET;
		Bun.env.BARDO_DEFAULT_RULESET = "unknown_ruleset";
		try {
			const result = await runPlayerAction({
				auth: context.auth,
				action: "I attack the guard",
				idempotencyKey: "golden_unsupported_action_key",
				guidedSetupEnabled: false,
				nowIso: "2026-02-23T12:20:00.000Z",
			});
			assertCondition(
				result.success === false,
				"Unsupported ruleset should fail.",
			);
			assertCondition(
				result.message.toLowerCase().includes("unsupported ruleset"),
				"Failure should be explicit about unsupported ruleset.",
			);

			const events = await readCanonicalEvents({
				bardoRoot: context.bardoRoot,
			});
			assertCondition(
				events.length === 0,
				"Unsupported ruleset failure should not append partial canonical events.",
			);
			return {
				id: "unsupported_action_rejected",
				success: true,
				message: "Unsupported action scenario passed.",
				details: {
					eventTypes: events.map((event) => event.type),
					message: result.message,
				},
			};
		} finally {
			if (previousRuleset === undefined) {
				delete Bun.env.BARDO_DEFAULT_RULESET;
			} else {
				Bun.env.BARDO_DEFAULT_RULESET = previousRuleset;
			}
		}
	});
}

async function runNarrativeRulesetResolutionScenario(): Promise<GoldenScenarioResult> {
	return withScenarioRoot("bardo-golden-narrative-", async (context) => {
		const previousRuleset = Bun.env.BARDO_DEFAULT_RULESET;
		Bun.env.BARDO_DEFAULT_RULESET = "narrative_v1";
		try {
			const result = await runPlayerAction({
				auth: context.auth,
				action: "I attack the guard from cover",
				idempotencyKey: "golden_narrative_ruleset_key",
				guidedSetupEnabled: false,
				nowIso: "2026-02-23T12:30:00.000Z",
			});
			assertCondition(
				result.success === true,
				"Narrative ruleset should resolve.",
			);
			assertCondition(
				result.mechanics.ruleset === "narrative_v1",
				"Expected narrative_v1 mechanics.",
			);
			assertCondition(
				result.mechanics.resolutionMode === "deterministic",
				"Narrative ruleset should be deterministic.",
			);

			const events = await readCanonicalEvents({
				bardoRoot: context.bardoRoot,
			});
			const eventTypes = events.map((event) => event.type);
			assertCondition(
				eventTypes.join(",") ===
					"player_action_declared,action_intent_validated,mechanics_resolved,player_action_resolved",
				"Narrative ruleset should not append dice_rolled events.",
			);

			return {
				id: "narrative_ruleset_resolution",
				success: true,
				message: "Narrative ruleset resolution scenario passed.",
				details: {
					eventTypes,
					resolutionMode: result.mechanics.resolutionMode,
				},
			};
		} finally {
			if (previousRuleset === undefined) {
				delete Bun.env.BARDO_DEFAULT_RULESET;
			} else {
				Bun.env.BARDO_DEFAULT_RULESET = previousRuleset;
			}
		}
	});
}

async function runStackedConditionResolutionScenario(): Promise<GoldenScenarioResult> {
	return withScenarioRoot(
		"bardo-golden-stacked-condition-",
		async (context) => {
			const result = await runPlayerAction({
				auth: context.auth,
				action: "I attack while blinded and distracted but still press forward",
				idempotencyKey: "golden_stacked_condition_key",
				guidedSetupEnabled: false,
				nowIso: "2026-02-23T12:40:00.000Z",
			});
			assertCondition(
				result.success === true,
				"Stacked condition action should resolve.",
			);
			assertCondition(result.mechanics.required, "Combat mechanics expected.");
			assertCondition(
				result.mechanics.advantage === "disadvantage",
				"Stacked negative conditions should resolve to disadvantage.",
			);

			const events = await readCanonicalEvents({
				bardoRoot: context.bardoRoot,
			});
			const mechanicsEvent = events.find(
				(event) => event.type === "mechanics_resolved",
			);
			assertCondition(
				Boolean(mechanicsEvent),
				"mechanics_resolved event expected.",
			);
			const eventAdvantage = (mechanicsEvent?.data as Record<string, unknown>)
				?.advantage;
			assertCondition(
				eventAdvantage === "disadvantage",
				"mechanics_resolved should persist disadvantage state.",
			);

			return {
				id: "stacked_condition_resolution",
				success: true,
				message: "Stacked condition scenario passed.",
				details: {
					eventTypes: events.map((event) => event.type),
					advantage: result.mechanics.advantage,
				},
			};
		},
	);
}

async function runEventOrderingStressScenario(): Promise<GoldenScenarioResult> {
	return withScenarioRoot("bardo-golden-ordering-stress-", async (context) => {
		const actions = [
			"I explore the market",
			"I talk to the quartermaster",
			"I attack the thief",
			"I rest by the campfire",
			"I attack the guard captain",
		] as const;
		const ordering: Array<{
			action: string;
			expectedEventTypes: string[];
			actualEventTypes: string[];
			match: boolean;
		}> = [];
		let previousEventCount = 0;

		for (const [index, action] of actions.entries()) {
			await runPlayerAction({
				auth: context.auth,
				action,
				idempotencyKey: `golden_ordering_stress_${String(index + 1)}`,
				guidedSetupEnabled: false,
				nowIso: new Date(Date.UTC(2026, 1, 23, 13, 0, index + 1)).toISOString(),
			});
			const events = await readCanonicalEvents({
				bardoRoot: context.bardoRoot,
			});
			const actualEventTypes = events
				.slice(previousEventCount)
				.map((event) => event.type);
			const expectedEventTypes = expectedEventTypesForAction(action);
			ordering.push({
				action,
				expectedEventTypes,
				actualEventTypes,
				match: arraysEqual(expectedEventTypes, actualEventTypes),
			});
			previousEventCount = events.length;
		}

		assertCondition(
			ordering.every((entry) => entry.match),
			"At least one turn produced non-deterministic event ordering.",
		);

		return {
			id: "event_ordering_stress",
			success: true,
			message: "Event ordering stress scenario passed.",
			details: {
				eventTypes: ordering.flatMap((entry) => entry.actualEventTypes),
				ordering,
			},
		};
	});
}

async function runGoldenScenario(
	scenarioId: GoldenScenarioId,
): Promise<GoldenScenarioResult> {
	try {
		switch (scenarioId) {
			case "combat_exchange":
				return await runCombatExchangeScenario();
			case "safety_boundary_block":
				return await runSafetyBoundaryBlockScenario();
			case "idempotent_replay_integrity":
				return await runIdempotentReplayIntegrityScenario();
			case "legacy_state_migration":
				return await runLegacyStateMigrationScenario();
			case "unsupported_action_rejected":
				return await runUnsupportedActionRejectedScenario();
			case "narrative_ruleset_resolution":
				return await runNarrativeRulesetResolutionScenario();
			case "stacked_condition_resolution":
				return await runStackedConditionResolutionScenario();
			case "event_ordering_stress":
				return await runEventOrderingStressScenario();
		}
	} catch (error) {
		return {
			id: scenarioId,
			success: false,
			message:
				error instanceof Error
					? `Scenario failed: ${error.message}`
					: "Scenario failed.",
			details: {},
		};
	}
}

export async function runGoldenScenarioSuite(args: {
	scenarioIds?: GoldenScenarioId[];
}): Promise<{
	total: number;
	passed: number;
	failed: number;
	results: GoldenScenarioResult[];
}> {
	const scenarioIds = args.scenarioIds?.length
		? args.scenarioIds
		: [...GOLDEN_SCENARIO_IDS];
	const results: GoldenScenarioResult[] = [];
	for (const scenarioId of scenarioIds) {
		results.push(await runGoldenScenario(scenarioId));
	}
	const passed = results.filter((entry) => entry.success).length;
	const failed = results.length - passed;
	return {
		total: results.length,
		passed,
		failed,
		results,
	};
}
