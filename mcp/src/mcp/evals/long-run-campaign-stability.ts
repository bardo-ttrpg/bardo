import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readCanonicalEvents } from "../../domain/events/store";
import {
	evaluateReplayInvariants,
	evaluateTurnInvariants,
} from "../../domain/invariants/campaign-invariants";
import { parseMarkdown } from "../../domain/markdown/markdown";
import { deriveCurrentStateFromEvents } from "../../domain/projections/current-state";
import { resolvePathInsideRoot } from "../../infra/filesystem/filesystem";
import {
	renderPrometheusMetrics,
	resetTelemetryForTests,
} from "../../telemetry";
import type { AuthContext } from "../../types/contracts";
import {
	intentRequiresMechanics,
	parseIntent,
} from "../tools/player-action/parsing";
import { runPlayerAction } from "../tools/player-action/register";

const ACTION_SCRIPT = [
	"I explore the lantern market",
	"I talk to the dockmaster about recent rumors",
	"I travel to the old bridge",
	"I attack the bandit lookout",
	"I rest and regroup by the campfire",
] as const;

export type LongRunTurnResult = {
	turn: number;
	action: string;
	success: boolean;
	canonicalEvents: number;
	projectionConsistent: boolean;
	worldTimeISO: string;
	message: string;
	retryInjected: boolean;
	retryFailedAttempt: boolean;
	retryFailedAttemptEventDelta: number;
	eventTypes: string[];
	expectedEventTypes: string[];
	eventOrderingOk: boolean;
};

export type LongRunCampaignStabilityResult = {
	success: boolean;
	turnCount: number;
	failedTurns: number;
	turnResults: LongRunTurnResult[];
	invariantFailures: {
		actionFailed: number;
		eventGrowthViolation: number;
		projectionDrift: number;
		replayEventDrift: number;
		replayProjectionDrift: number;
		eventOrderingDrift: number;
		partialCanonicalStateAfterRetryFailure: number;
	};
	replayConsistency: {
		stable: boolean;
		eventCountBeforeReplay: number;
		eventCountAfterReplay: number;
		projectionStable: boolean;
	};
	fallbackCounters: {
		used: number;
		blocked: number;
	};
	policyViolationCounters: {
		runtimePolicyBlockedEvents: number;
	};
	retryInjection: {
		enabled: boolean;
		injectedTurns: number;
		failedAttempts: number;
		partialStateViolations: number;
	};
	eventOrderingLogs: Array<{
		turn: number;
		expectedEventTypes: string[];
		actualEventTypes: string[];
		match: boolean;
	}>;
};

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function actionForTurn(turn: number): string {
	return ACTION_SCRIPT[(turn - 1) % ACTION_SCRIPT.length] ?? "I wait.";
}

async function readProjectionState(
	bardoRoot: string,
): Promise<Record<string, unknown>> {
	const projectionPath = resolvePathInsideRoot(
		bardoRoot,
		"projections/current-state.md",
	);
	const raw = await readFile(projectionPath, "utf8");
	return JSON.parse(parseMarkdown(raw).content) as Record<string, unknown>;
}

function expectedEventTypesForAction(action: string): string[] {
	const intent = parseIntent(action);
	if (intentRequiresMechanics(intent, action)) {
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

function sumCounterByOutcome(args: {
	metrics: string;
	name: string;
	outcome: "used" | "blocked";
}): number {
	const expression = new RegExp(
		`^${args.name}\\{[^}]*outcome="${args.outcome}"[^}]*\\}\\s+([0-9]+(?:\\.[0-9]+)?)$`,
		"m",
	);
	let total = 0;
	for (const line of args.metrics.split("\n")) {
		const match = line.match(expression);
		if (!match?.[1]) {
			continue;
		}
		total += Number.parseFloat(match[1]);
	}
	return total;
}

export async function runLongRunCampaignStabilityEval(args: {
	turnCount?: number;
	retryInjection?: boolean;
}): Promise<LongRunCampaignStabilityResult> {
	const turnCount = Math.max(25, Math.min(40, args.turnCount ?? 30));
	const retryInjectionEnabled = args.retryInjection ?? true;
	const root = await mkdtemp(path.join(os.tmpdir(), "bardo-long-run-eval-"));
	const bardoRoot = path.join(root, "bardo");
	const auth = createAuth(root);
	const turnResults: LongRunTurnResult[] = [];
	const eventOrderingLogs: Array<{
		turn: number;
		expectedEventTypes: string[];
		actualEventTypes: string[];
		match: boolean;
	}> = [];
	const invariantFailures = {
		actionFailed: 0,
		eventGrowthViolation: 0,
		projectionDrift: 0,
		replayEventDrift: 0,
		replayProjectionDrift: 0,
		eventOrderingDrift: 0,
		partialCanonicalStateAfterRetryFailure: 0,
	};

	const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
	const previousRuleset = Bun.env.BARDO_DEFAULT_RULESET;
	resetTelemetryForTests();
	Bun.env.BARDO_STRICT_CANONICAL_MODE = "true";
	if (!Bun.env.BARDO_DEFAULT_RULESET) {
		Bun.env.BARDO_DEFAULT_RULESET = "d20_v1";
	}

	try {
		let lastEventCount = 0;
		let injectedTurns = 0;
		let failedAttempts = 0;
		for (let turn = 1; turn <= turnCount; turn += 1) {
			const action = actionForTurn(turn);
			const key = `long_run_turn_${String(turn).padStart(2, "0")}`;
			const nowIso = new Date(Date.UTC(2026, 1, 23, 13, turn, 0)).toISOString();
			const shouldInjectFailure = retryInjectionEnabled && turn % 5 === 0;
			let retryFailedAttempt = false;
			let retryFailedAttemptEventDelta = 0;

			if (shouldInjectFailure) {
				injectedTurns += 1;
				const eventsBeforeFailedAttempt = await readCanonicalEvents({
					bardoRoot,
				});
				failedAttempts += 1;
				retryFailedAttempt = true;
				Bun.env.BARDO_DEFAULT_RULESET = "unknown_ruleset";
				const failedResult = await runPlayerAction({
					auth,
					action: "I attack the retry-injection sentinel",
					idempotencyKey: `${key}_retry_probe`,
					guidedSetupEnabled: false,
					nowIso,
				});
				if (failedResult.success) {
					throw new Error(
						"Retry injection probe unexpectedly succeeded; failure path was not exercised.",
					);
				}
				const eventsAfterFailedAttempt = await readCanonicalEvents({
					bardoRoot,
				});
				retryFailedAttemptEventDelta =
					eventsAfterFailedAttempt.length - eventsBeforeFailedAttempt.length;
				if (retryFailedAttemptEventDelta !== 0) {
					invariantFailures.partialCanonicalStateAfterRetryFailure += 1;
				}
				Bun.env.BARDO_DEFAULT_RULESET = previousRuleset ?? "d20_v1";
			}

			const result = await runPlayerAction({
				auth,
				action,
				idempotencyKey: key,
				guidedSetupEnabled: false,
				nowIso,
			});

			const events = await readCanonicalEvents({ bardoRoot });
			const projectionState = await readProjectionState(bardoRoot);
			const derivedState = deriveCurrentStateFromEvents(events);
			const turnInvariant = evaluateTurnInvariants({
				actionSuccess: result.success,
				previousEventCount: lastEventCount,
				currentEventCount: events.length,
				projectionState,
				derivedState,
			});
			if (turnInvariant.failures.actionFailed) {
				invariantFailures.actionFailed += 1;
			}
			if (turnInvariant.failures.eventGrowthViolation) {
				invariantFailures.eventGrowthViolation += 1;
			}
			if (turnInvariant.failures.projectionDrift) {
				invariantFailures.projectionDrift += 1;
			}

			const expectedEventTypes = expectedEventTypesForAction(action);
			const eventTypes = events
				.slice(lastEventCount)
				.map((event) => event.type);
			const eventOrderingOk = arraysEqual(expectedEventTypes, eventTypes);
			if (!eventOrderingOk) {
				invariantFailures.eventOrderingDrift += 1;
			}
			eventOrderingLogs.push({
				turn,
				expectedEventTypes,
				actualEventTypes: eventTypes,
				match: eventOrderingOk,
			});
			lastEventCount = events.length;

			turnResults.push({
				turn,
				action,
				success: turnInvariant.success && eventOrderingOk,
				canonicalEvents: events.length,
				projectionConsistent: turnInvariant.projectionConsistent,
				worldTimeISO:
					typeof projectionState.worldTimeISO === "string"
						? projectionState.worldTimeISO
						: "",
				message: result.message,
				retryInjected: shouldInjectFailure,
				retryFailedAttempt,
				retryFailedAttemptEventDelta,
				eventTypes,
				expectedEventTypes,
				eventOrderingOk,
			});
		}

		const eventsBeforeReplay = await readCanonicalEvents({ bardoRoot });
		const projectionBeforeReplay = await readProjectionState(bardoRoot);

		for (let turn = 1; turn <= turnCount; turn += 1) {
			await runPlayerAction({
				auth,
				action: actionForTurn(turn),
				idempotencyKey: `long_run_turn_${String(turn).padStart(2, "0")}`,
				guidedSetupEnabled: false,
				nowIso: new Date(Date.UTC(2026, 1, 24, 13, turn, 0)).toISOString(),
			});
		}

		const eventsAfterReplay = await readCanonicalEvents({ bardoRoot });
		const projectionAfterReplay = await readProjectionState(bardoRoot);
		const replayInvariant = evaluateReplayInvariants({
			eventCountBeforeReplay: eventsBeforeReplay.length,
			eventCountAfterReplay: eventsAfterReplay.length,
			projectionBeforeReplay,
			projectionAfterReplay,
		});
		if (replayInvariant.failures.replayEventDrift) {
			invariantFailures.replayEventDrift += 1;
		}
		if (replayInvariant.failures.replayProjectionDrift) {
			invariantFailures.replayProjectionDrift += 1;
		}
		const failedTurns = turnResults.filter((turn) => !turn.success).length;
		const metrics = renderPrometheusMetrics();
		const runtimePolicyBlockedEvents = eventsAfterReplay.filter(
			(event) => event.type === "runtime_policy_blocked",
		).length;
		const partialStateViolations =
			invariantFailures.partialCanonicalStateAfterRetryFailure;

		return {
			success:
				failedTurns === 0 &&
				replayInvariant.stable &&
				partialStateViolations === 0,
			turnCount,
			failedTurns,
			turnResults,
			invariantFailures,
			replayConsistency: {
				stable: replayInvariant.stable,
				eventCountBeforeReplay: eventsBeforeReplay.length,
				eventCountAfterReplay: eventsAfterReplay.length,
				projectionStable: replayInvariant.projectionStable,
			},
			fallbackCounters: {
				used: sumCounterByOutcome({
					metrics,
					name: "bardo_legacy_fallback_reads_total",
					outcome: "used",
				}),
				blocked: sumCounterByOutcome({
					metrics,
					name: "bardo_legacy_fallback_reads_total",
					outcome: "blocked",
				}),
			},
			policyViolationCounters: {
				runtimePolicyBlockedEvents,
			},
			retryInjection: {
				enabled: retryInjectionEnabled,
				injectedTurns,
				failedAttempts,
				partialStateViolations,
			},
			eventOrderingLogs,
		};
	} finally {
		if (previousStrict === undefined) {
			delete Bun.env.BARDO_STRICT_CANONICAL_MODE;
		} else {
			Bun.env.BARDO_STRICT_CANONICAL_MODE = previousStrict;
		}
		if (previousRuleset === undefined) {
			delete Bun.env.BARDO_DEFAULT_RULESET;
		} else {
			Bun.env.BARDO_DEFAULT_RULESET = previousRuleset;
		}
		await rm(root, { recursive: true, force: true });
	}
}
