import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toDisplayName } from "../../../domain/campaign/naming";
import {
	defaultOptionalSystems,
	loadOptionalSystems,
} from "../../../domain/campaign/optional-systems";
import { resolveFeatureFlags } from "../../../domain/config/features";
import { appendCanonicalEvent } from "../../../domain/events/store";
import {
	getIdempotentResult,
	setIdempotentResult,
} from "../../../domain/idempotency/store";
import type { AdvantageMode } from "../../../domain/mechanics/dice";
import { resolveRulesetAdapter } from "../../../domain/mechanics/rulesets/registry";
import type { MechanicsActionType } from "../../../domain/mechanics/rulesets/types";
import {
	evaluateRuntimePolicy,
	loadAuthorityPolicy,
	loadTableContract,
	summarizeRuntimePolicyViolations,
} from "../../../domain/policy/runtime-guards";
import { loadPreferredCurrentState } from "../../../domain/projections/preferred-state";
import { regenerateProjectionsForEventTypes } from "../../../domain/projections/refresh";
import { resolveBardoRoot } from "../../../infra/filesystem/filesystem";
import type { AuthContext } from "../../../types/contracts";
import { makeToolResult } from "../../tool-result";
import {
	type GuidedSetupFlowResult,
	runGuidedSetupFlow,
} from "../init/setup-flow";
import type { SetupAnswers } from "../init/setup-schemas";
import {
	defaultAdvanceMinutes,
	extractTargetLocation,
	normalizeIsoDate,
	parseIntent,
	resolveTravelTarget,
} from "./parsing";
import {
	buildHistoryEntry,
	createUnknownNpc,
	ensureLocationFile,
	ensurePlayerActionDirectories,
	loadKnownLocations,
	resolvePlayerActionPaths,
} from "./persistence";
import {
	narrationGuardrails,
	type PlayerActionOutput,
	playerActionInputSchema,
	playerActionOutputSchema,
} from "./schemas";

const PLAYER_ACTION_SCOPE = "player_action";

type PlayerActionMechanics = {
	ruleset: string;
	required: boolean;
	resolved: boolean;
	actionType: MechanicsActionType | null;
	targetDifficulty: number | null;
	modifier: number;
	advantage: AdvantageMode | null;
	rawRoll: number | null;
	total: number | null;
	outcome: "success" | "failure" | null;
	margin: number | null;
	resolutionMode: "dice" | "deterministic" | "unsupported" | null;
	unsupportedReason: string | null;
	trace: Record<string, unknown> | null;
	validationErrors: string[];
};

type SetupRuntimeState = {
	status: GuidedSetupFlowResult["status"];
	questionKey: GuidedSetupFlowResult["questionKey"];
	question: GuidedSetupFlowResult["question"];
	progressAnswered: number;
	progressTotal: number;
	warnings: string[];
	evidenceSummary: string[];
	revision: number;
	conflict: {
		detected: boolean;
		reason: string | null;
	};
	integrity: {
		ok: boolean;
		missingPaths: string[];
		invalidPaths: string[];
	};
	actionToExecute: string | null;
	pendingAction: string | null;
};

function defaultSetupBypassState(): SetupRuntimeState {
	return {
		status: "complete",
		questionKey: null,
		question: null,
		progressAnswered: 0,
		progressTotal: 0,
		warnings: [],
		evidenceSummary: [],
		revision: 0,
		conflict: {
			detected: false,
			reason: null,
		},
		integrity: {
			ok: true,
			missingPaths: [],
			invalidPaths: [],
		},
		actionToExecute: null,
		pendingAction: null,
	};
}

function canonicalPlayerActionEventBase(
	idempotencyKey: string | undefined,
): string {
	if (!idempotencyKey) {
		return crypto.randomUUID();
	}
	return idempotencyKey
		.toLowerCase()
		.replaceAll(/[^a-z0-9_-]/g, "-")
		.slice(0, 80);
}

function defaultMechanicsSummary(required: boolean): PlayerActionMechanics {
	return {
		ruleset: defaultMechanicsRulesetId(),
		required,
		resolved: false,
		actionType: null,
		targetDifficulty: null,
		modifier: 0,
		advantage: null,
		rawRoll: null,
		total: null,
		outcome: null,
		margin: null,
		resolutionMode: null,
		unsupportedReason: null,
		trace: null,
		validationErrors: [],
	};
}

function resolveMechanicsActionType(
	intent: PlayerActionOutput["intent"],
	rulesetId: string,
): MechanicsActionType | null {
	if (rulesetId === "narrative_v1") {
		if (intent === "combat") {
			return "narrative_check";
		}
		if (intent === "social") {
			return "social_check";
		}
		return null;
	}
	if (intent === "combat") {
		return "attack_roll";
	}
	if (intent === "social") {
		return "skill_check";
	}
	return null;
}

function resolveAdvantageFromAction(action: string): AdvantageMode {
	const normalized = action.toLowerCase();
	if (
		/\b(disadvantage|hindered|blinded|distracted|rushed)\b/.test(normalized)
	) {
		return "disadvantage";
	}
	if (/\b(advantage|carefully|flank|ambush|aim)\b/.test(normalized)) {
		return "advantage";
	}
	return "none";
}

function resolveTargetDifficulty(args: {
	intent: PlayerActionOutput["intent"];
	action: string;
}): number {
	const normalized = args.action.toLowerCase();
	if (/\b(very hard|extreme|legendary)\b/.test(normalized)) {
		return 18;
	}
	if (/\b(hard|difficult)\b/.test(normalized)) {
		return 15;
	}
	if (/\b(easy|simple)\b/.test(normalized)) {
		return 10;
	}
	return args.intent === "combat" ? 12 : 13;
}

function resolveModifier(args: {
	intent: PlayerActionOutput["intent"];
	action: string;
}): number {
	const normalized = args.action.toLowerCase();
	const base = args.intent === "combat" ? 2 : 1;
	if (/\b(power attack|reckless|all-out)\b/.test(normalized)) {
		return base + 2;
	}
	if (/\b(careful|defensive|hesitant)\b/.test(normalized)) {
		return base - 1;
	}
	return base;
}

function defaultMechanicsRulesetId(): string {
	const configured = Bun.env.BARDO_DEFAULT_RULESET?.trim();
	return configured && configured.length > 0 ? configured : "d20_v1";
}

export async function runPlayerAction(args: {
	auth: AuthContext;
	action: string;
	bootstrapAnswers?: Record<string, string>;
	setupAnswers?: SetupAnswers;
	setupRevision?: number;
	idempotencyKey?: string;
	guidedSetupEnabled?: boolean;
	nowIso?: string;
}): Promise<PlayerActionOutput> {
	const bardoRoot = resolveBardoRoot(args.auth.campaignBasePath);
	const paths = resolvePlayerActionPaths(bardoRoot);
	const nowIso = args.nowIso ?? new Date().toISOString();
	const guidedSetupEnabled =
		args.guidedSetupEnabled ?? resolveFeatureFlags(Bun.env).guidedSetupEnabled;
	const createdNpcIds: string[] = [];
	const createdLocationIds: string[] = [];
	const actionEventBase = canonicalPlayerActionEventBase(args.idempotencyKey);

	try {
		if (args.idempotencyKey) {
			const replay = await getIdempotentResult({
				bardoRoot,
				key: args.idempotencyKey,
				scope: PLAYER_ACTION_SCOPE,
			});
			if (typeof replay === "object" && replay !== null) {
				return {
					...(replay as PlayerActionOutput),
					idempotentReplay: true,
				};
			}
		}

		let setup = defaultSetupBypassState();
		let actionToRun = args.action;

		if (guidedSetupEnabled) {
			const setupResult = await runGuidedSetupFlow({
				campaignBasePath: args.auth.campaignBasePath,
				nowIso,
				bootstrapAnswers: args.bootstrapAnswers,
				setupAnswers: args.setupAnswers,
				expectedRevision: args.setupRevision,
				incomingAction: args.action,
			});
			setup = {
				status: setupResult.status,
				questionKey: setupResult.questionKey,
				question: setupResult.question,
				progressAnswered: setupResult.progressAnswered,
				progressTotal: setupResult.progressTotal,
				warnings: setupResult.warnings,
				evidenceSummary: setupResult.evidenceSummary,
				revision: setupResult.revision,
				conflict: setupResult.conflict,
				integrity: setupResult.integrity,
				actionToExecute: setupResult.actionToExecute,
				pendingAction: setupResult.pendingAction,
			};

			if (setupResult.status !== "complete") {
				return {
					success: true,
					message:
						setupResult.status === "locked"
							? setupResult.message
							: "Setup is required before gameplay can proceed.",
					idempotentReplay: false,
					rootPath: bardoRoot,
					intent: "general",
					timeAdvancedMinutes: 0,
					worldTimeBeforeISO: "",
					worldTimeAfterISO: "",
					locationBefore: "",
					locationAfter: "",
					createdNpcIds: [],
					createdLocationIds: [],
					mechanics: defaultMechanicsSummary(false),
					historyEntry: "",
					statePath: paths.statePath,
					historyPath: paths.historyPath,
					narrationGuardrails: [...narrationGuardrails],
					optionalSystems: { ...defaultOptionalSystems },
					requiresSetup: true,
					setupStatus: setupResult.status,
					setupQuestionKey: setupResult.questionKey,
					setupQuestion: setupResult.question,
					setupProgressAnswered: setupResult.progressAnswered,
					setupProgressTotal: setupResult.progressTotal,
					setupWarnings: setupResult.warnings,
					setupEvidenceSummary: setupResult.evidenceSummary,
					setupRevision: setupResult.revision,
					setupConflict: setupResult.conflict,
					setupIntegrity: setupResult.integrity,
					pendingAction: setupResult.pendingAction,
				};
			}

			actionToRun = setupResult.actionToExecute ?? args.action;
		}

		const optionalSystems = await loadOptionalSystems(bardoRoot);
		const tableContract = await loadTableContract({ bardoRoot });
		const authorityPolicy = await loadAuthorityPolicy({ bardoRoot });
		const runtimeViolations = evaluateRuntimePolicy({
			action: actionToRun,
			tableContract,
			authorityPolicy,
		});
		if (runtimeViolations.length > 0) {
			const blockedMessage =
				summarizeRuntimePolicyViolations(runtimeViolations);
			await appendCanonicalEvent({
				bardoRoot,
				event: {
					id: `evt-player-action-policy-${actionEventBase}`,
					type: "runtime_policy_blocked",
					atISO: nowIso,
					source: "player_action",
					data: {
						action: actionToRun,
						runtimeViolations,
						tableContract: {
							tone: tableContract.tone,
							boundaries: tableContract.boundaries,
							pvp: tableContract.pvp,
							retconPolicy: tableContract.retconPolicy,
						},
						authorityPolicy: {
							mode: authorityPolicy.mode,
							factIntroduction: authorityPolicy.factIntroduction,
							ruleAdjudication: authorityPolicy.ruleAdjudication,
							safetyVeto: authorityPolicy.safetyVeto,
							allowRuleBypass: authorityPolicy.allowRuleBypass,
							allowUnilateralRetcon: authorityPolicy.allowUnilateralRetcon,
							allowPlayerCanonDeclarations:
								authorityPolicy.allowPlayerCanonDeclarations,
						},
					},
				},
			});
			const output: PlayerActionOutput = {
				success: false,
				message: `Action blocked by runtime policy: ${blockedMessage}`,
				idempotentReplay: false,
				rootPath: bardoRoot,
				intent: parseIntent(actionToRun),
				timeAdvancedMinutes: 0,
				worldTimeBeforeISO: "",
				worldTimeAfterISO: "",
				locationBefore: "",
				locationAfter: "",
				createdNpcIds: [],
				createdLocationIds: [],
				mechanics: defaultMechanicsSummary(false),
				historyEntry: "",
				statePath: paths.statePath,
				historyPath: paths.historyPath,
				narrationGuardrails: [...narrationGuardrails],
				optionalSystems,
				requiresSetup: false,
				setupStatus: setup.status,
				setupQuestionKey: null,
				setupQuestion: null,
				setupProgressAnswered: setup.progressAnswered,
				setupProgressTotal: setup.progressTotal,
				setupWarnings: setup.warnings,
				setupEvidenceSummary: setup.evidenceSummary,
				setupRevision: setup.revision,
				setupConflict: setup.conflict,
				setupIntegrity: setup.integrity,
				pendingAction: null,
			};
			if (args.idempotencyKey) {
				await setIdempotentResult({
					bardoRoot,
					key: args.idempotencyKey,
					scope: PLAYER_ACTION_SCOPE,
					result: output,
					nowIso,
				});
			}
			return output;
		}

		const knownLocations = await loadKnownLocations(bardoRoot);
		await ensurePlayerActionDirectories(bardoRoot, paths);

		const preferredState = await loadPreferredCurrentState({
			bardoRoot,
			consumer: "player_action",
		});
		const state = JSON.parse(
			JSON.stringify(preferredState.chosen.state),
		) as Awaited<
			ReturnType<typeof loadPreferredCurrentState>
		>["chosen"]["state"];
		const intent = parseIntent(actionToRun);
		const mechanicsRuleset = defaultMechanicsRulesetId();
		const mechanicsActionType = resolveMechanicsActionType(
			intent,
			mechanicsRuleset,
		);
		const mechanicsAdapter = mechanicsActionType
			? resolveRulesetAdapter(mechanicsRuleset)
			: null;
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: `evt-player-action-declared-${actionEventBase}`,
				type: "player_action_declared",
				atISO: nowIso,
				source: "player_action",
				data: {
					action: actionToRun,
				},
			},
		});
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: `evt-player-action-intent-${actionEventBase}`,
				type: "action_intent_validated",
				atISO: nowIso,
				source: "player_action",
				data: {
					action: actionToRun,
					intent,
				},
			},
		});
		const locationBefore = state.currentLocation;
		const targetLocationText = extractTargetLocation(actionToRun);
		let locationAfter = state.currentLocation;

		if (intent === "travel" && targetLocationText) {
			const resolved = resolveTravelTarget(targetLocationText, knownLocations);
			const targetSlug = resolved.slug;
			locationAfter = targetSlug;
			if (!state.locations[targetSlug]) {
				state.locations[targetSlug] = {
					name: resolved.name,
					visits: 0,
					npcIds: [],
				};
			}

			if (optionalSystems.worldGeneration) {
				const ensuredLocation = await ensureLocationFile({
					bardoRoot,
					locationSlug: targetSlug,
					locationName: state.locations[targetSlug].name,
				});
				if (ensuredLocation.created) {
					createdLocationIds.push(targetSlug);
				}
			}
		}

		if (!state.locations[locationAfter]) {
			state.counters.unknownLocation += 1;
			const generatedSlug =
				locationAfter || `unknown-location-${state.counters.unknownLocation}`;
			locationAfter = generatedSlug;
			state.locations[generatedSlug] = {
				name: toDisplayName(generatedSlug),
				visits: 0,
				npcIds: [],
			};
			if (optionalSystems.worldGeneration) {
				const ensuredLocation = await ensureLocationFile({
					bardoRoot,
					locationSlug: generatedSlug,
					locationName: state.locations[generatedSlug].name,
				});
				if (ensuredLocation.created) {
					createdLocationIds.push(generatedSlug);
				}
			}
		}

		state.currentLocation = locationAfter;
		const locationRecord = state.locations[locationAfter];
		if (!locationRecord) {
			throw new Error("Failed to resolve location record for action.");
		}
		locationRecord.visits += 1;

		const shouldSpawnAmbient = intent === "travel" || intent === "explore";
		if (shouldSpawnAmbient && optionalSystems.npcs) {
			const existingAtLocation = locationRecord.npcIds.length;
			const desiredMinimum = 2;
			const toCreate = Math.max(0, desiredMinimum - existingAtLocation);
			for (let i = 0; i < toCreate; i += 1) {
				state.counters.unknownNpc += 1;
				const npc = await createUnknownNpc({
					bardoRoot,
					npcIndex: state.counters.unknownNpc,
					locationSlug: locationAfter,
				});
				locationRecord.npcIds.push(npc.id);
				createdNpcIds.push(npc.id);
			}
		}

		const worldTimeBeforeISO = normalizeIsoDate(state.worldTimeISO);
		const advance = defaultAdvanceMinutes(intent);
		const nextWorldTime = new Date(worldTimeBeforeISO);
		nextWorldTime.setMinutes(nextWorldTime.getMinutes() + advance);
		const worldTimeAfterISO = nextWorldTime.toISOString();
		state.worldTimeISO = worldTimeAfterISO;
		state.lastAction = actionToRun;

		let mechanics = {
			...defaultMechanicsSummary(mechanicsActionType !== null),
			ruleset: mechanicsRuleset,
		};
		if (mechanicsActionType && mechanicsAdapter) {
			const targetDifficulty = resolveTargetDifficulty({
				intent,
				action: actionToRun,
			});
			const modifier = resolveModifier({ intent, action: actionToRun });
			const advantage = resolveAdvantageFromAction(actionToRun);
			const validation = mechanicsAdapter.validate({
				actionType: mechanicsActionType,
				targetDifficulty,
				modifier,
				actorId: "pc_party",
				declaredIntent: actionToRun,
				advantage,
			});
			if (!validation.valid) {
				throw new Error(
					`${mechanicsAdapter.id} mechanics validation failed: ${validation.errors.join("; ")}`,
				);
			}

			const resolution = mechanicsAdapter.resolve({
				actionType: mechanicsActionType,
				targetDifficulty,
				modifier,
				actorId: "pc_party",
				declaredIntent: actionToRun,
				advantage,
			});
			if (resolution.resolutionMode === "unsupported") {
				throw new Error(
					resolution.unsupportedReason ??
						`${mechanicsAdapter.id} does not support this mechanics request.`,
				);
			}

			mechanics = {
				ruleset: mechanicsAdapter.id,
				required: true,
				resolved: true,
				actionType: resolution.actionType,
				targetDifficulty: resolution.targetDifficulty,
				modifier: resolution.modifier,
				advantage: resolution.advantage,
				rawRoll: resolution.rawRoll,
				total: resolution.total,
				outcome: resolution.outcome,
				margin: resolution.margin,
				resolutionMode: resolution.resolutionMode,
				unsupportedReason: resolution.unsupportedReason,
				trace: resolution.trace,
				validationErrors: [],
			};

			if (resolution.rolls.length > 0) {
				await appendCanonicalEvent({
					bardoRoot,
					event: {
						id: `evt-player-action-dice-${actionEventBase}`,
						type: "dice_rolled",
						atISO: worldTimeAfterISO,
						source: "player_action",
						data: {
							ruleset: mechanicsAdapter.id,
							action: actionToRun,
							intent,
							actionType: resolution.actionType,
							targetDifficulty: resolution.targetDifficulty,
							modifier: resolution.modifier,
							advantage: resolution.advantage,
							rolls: resolution.rolls,
							selectedRoll: resolution.rawRoll,
							total: resolution.total,
							resolutionMode: resolution.resolutionMode,
						},
					},
				});
			}
			await appendCanonicalEvent({
				bardoRoot,
				event: {
					id: `evt-player-action-mechanics-${actionEventBase}`,
					type: "mechanics_resolved",
					atISO: worldTimeAfterISO,
					source: "player_action",
					data: {
						ruleset: mechanicsAdapter.id,
						action: actionToRun,
						intent,
						actionType: resolution.actionType,
						targetDifficulty: resolution.targetDifficulty,
						modifier: resolution.modifier,
						advantage: resolution.advantage,
						rawRoll: resolution.rawRoll,
						total: resolution.total,
						outcome: resolution.outcome,
						margin: resolution.margin,
						resolutionMode: resolution.resolutionMode,
						trace: resolution.trace,
					},
				},
			});
		}

		const historyEntry = buildHistoryEntry({
			worldTimeAfterISO,
			intent,
			action: actionToRun,
			locationBefore,
			locationAfter,
			newNpcCount: createdNpcIds.length,
			newLocationCount: createdLocationIds.length,
		});
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: `evt-player-action-${actionEventBase}`,
				type: "player_action_resolved",
				atISO: worldTimeAfterISO,
				source: "player_action",
				data: {
					action: actionToRun,
					intent,
					worldTimeBeforeISO,
					worldTimeAfterISO,
					locationBefore,
					locationAfter,
					createdNpcIds,
					createdLocationIds,
					mechanics,
				},
			},
		});
		await regenerateProjectionsForEventTypes({
			bardoRoot,
			eventTypes: ["player_action_resolved"],
		});

		const output: PlayerActionOutput = {
			success: true,
			message:
				createdNpcIds.length > 0 || createdLocationIds.length > 0
					? "Action processed. Time advanced and world context expanded automatically."
					: "Action processed. Time advanced and state updated.",
			idempotentReplay: false,
			rootPath: bardoRoot,
			intent,
			timeAdvancedMinutes: advance,
			worldTimeBeforeISO,
			worldTimeAfterISO,
			locationBefore,
			locationAfter,
			createdNpcIds,
			createdLocationIds,
			mechanics,
			historyEntry,
			statePath: paths.statePath,
			historyPath: paths.historyPath,
			narrationGuardrails: [...narrationGuardrails],
			optionalSystems,
			requiresSetup: false,
			setupStatus: setup.status,
			setupQuestionKey: null,
			setupQuestion: null,
			setupProgressAnswered: setup.progressAnswered,
			setupProgressTotal: setup.progressTotal,
			setupWarnings: setup.warnings,
			setupEvidenceSummary: setup.evidenceSummary,
			setupRevision: setup.revision,
			setupConflict: setup.conflict,
			setupIntegrity: setup.integrity,
			pendingAction: null,
		};

		if (args.idempotencyKey) {
			await setIdempotentResult({
				bardoRoot,
				key: args.idempotencyKey,
				scope: PLAYER_ACTION_SCOPE,
				result: output,
				nowIso,
			});
		}

		return output;
	} catch (error) {
		return {
			success: false,
			message:
				error instanceof Error
					? `Failed to process player action: ${error.message}`
					: "Failed to process player action.",
			idempotentReplay: false,
			rootPath: bardoRoot,
			intent: "general",
			timeAdvancedMinutes: 0,
			worldTimeBeforeISO: "",
			worldTimeAfterISO: "",
			locationBefore: "",
			locationAfter: "",
			createdNpcIds: [],
			createdLocationIds: [],
			mechanics: defaultMechanicsSummary(false),
			historyEntry: "",
			statePath: paths.statePath,
			historyPath: paths.historyPath,
			narrationGuardrails: [],
			optionalSystems: { ...defaultOptionalSystems },
			requiresSetup: false,
			setupStatus: "error",
			setupQuestionKey: null,
			setupQuestion: null,
			setupProgressAnswered: 0,
			setupProgressTotal: 0,
			setupWarnings: [],
			setupEvidenceSummary: [],
			setupRevision: 0,
			setupConflict: {
				detected: false,
				reason: null,
			},
			setupIntegrity: {
				ok: false,
				missingPaths: [],
				invalidPaths: [],
			},
			pendingAction: null,
		};
	}
}

export function registerPlayerActionTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"player_action",
		{
			title: "Process Player Action (Primary)",
			description:
				"Primary high-level gameplay tool and default for narrative user inputs (for example: `I travel to the village`, `I explore the ruins`, `I talk to the bartender`). It parses intent, advances world time automatically, updates persistent state/history, and creates unknown NPCs/locations when appropriate.",
			inputSchema: playerActionInputSchema,
			outputSchema: playerActionOutputSchema,
			annotations: {
				title: "Process Player Action",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: true,
			},
		},
		async ({
			action,
			bootstrapAnswers,
			setupAnswers,
			setupRevision,
			idempotencyKey,
		}) => {
			const output = await runPlayerAction({
				auth,
				action,
				bootstrapAnswers,
				setupAnswers,
				setupRevision,
				idempotencyKey,
			});
			return makeToolResult(output, !output.success);
		},
	);
}
