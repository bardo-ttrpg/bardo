import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toDisplayName } from "../../../domain/campaign/naming";
import {
	defaultOptionalSystems,
	loadOptionalSystems,
} from "../../../domain/campaign/optional-systems";
import { resolveFeatureFlags } from "../../../domain/config/features";
import { appendCanonicalEvent } from "../../../domain/events/store";
import {
	buildGmPacket,
	type DiscoveryCandidate,
	inferSemanticSceneFromAction,
	mergeStructuredDiscoveries,
	resolveSceneAnchorName,
	resolveSceneAnchorSlug,
	type StateDelta,
	syncStateForDiscoveries,
	upsertThread,
} from "../../../domain/gm/runtime";
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
import { regenerateCurrentStateProjection } from "../../../domain/projections/current-state";
import { loadPreferredCurrentState } from "../../../domain/projections/preferred-state";
import { regenerateProjectionsForEventTypes } from "../../../domain/projections/refresh";
import { withKeyedLock } from "../../../infra/concurrency/keyed-lock";
import { resolveBardoRoot } from "../../../infra/filesystem/filesystem";
import { recordSetupLegacyFieldEmitMetric } from "../../../telemetry";
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
	intentRequiresMechanics,
	normalizeIsoDate,
	parseIntent,
	resolveTravelTarget,
} from "./parsing";
import {
	buildHistoryEntry,
	createUnknownNpc,
	ensureLocationFile,
	ensureNpcFile,
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

function defaultStateDelta(): StateDelta {
	return {
		worldTimeBeforeISO: "",
		worldTimeAfterISO: "",
		locationBefore: "",
		locationAfter: "",
		timeAdvancedMinutes: 0,
		createdNpcIds: [],
		createdLocationIds: [],
	};
}

function defaultGmPacket(): PlayerActionOutput["gmPacket"] {
	return {
		sceneFrame: {
			locationId: "",
			locationName: "",
			summary: "",
			activeSituation: "",
			exits: [],
			sensoryCues: [],
			unresolvedQuestions: [],
		},
		resolution: {
			intent: "general",
			fiction: "",
			mechanicsSummary: "",
			outcome: "mixed",
		},
		narrativeBeats: [],
		npcReactions: [],
		discoveries: [],
		consequences: {
			timeAdvancedMinutes: 0,
			worldTimeAfterISO: "",
			locationAfter: "",
			clocksAdvanced: [],
			threadsActivated: [],
		},
		followUps: [],
		safetyNotes: [],
		renderingHints: {
			tone: "grounded_fantasy",
			pacing: "scene-focused",
			revealLevel: "incremental",
			rulesTransparency: "fiction-first",
		},
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

function resolveWorkspaceRulesetId(
	preferredState: Awaited<ReturnType<typeof loadPreferredCurrentState>>,
): string {
	if (preferredState.source === "empty_default") {
		return defaultMechanicsRulesetId();
	}
	const workspaceRuleset =
		preferredState.chosen.state.mechanicsContext.ruleset?.trim() ?? "";
	return workspaceRuleset.length > 0
		? workspaceRuleset
		: defaultMechanicsRulesetId();
}

const DISAPPEARANCE_PATTERN =
	/\b(disappearance|disappear(?:ed|ance)?|missing person|missing people|went missing|vanished?|vanish)\b/i;

function isDisappearanceInvestigationTarget(text: string | null): boolean {
	return text ? DISAPPEARANCE_PATTERN.test(text) : false;
}

function investigationThreadId(locationId: string): string {
	return `${resolveSceneAnchorSlug(locationId)}-disappearances`;
}

function investigationThreadTitle(locationId: string): string {
	return `${resolveSceneAnchorName(locationId)} disappearances`;
}

function resolveSceneSensoryCues(args: {
	locationTags: string[];
	intent: PlayerActionOutput["intent"];
	existing: string[];
	locationName: string;
	action: string;
}): string[] {
	if (args.locationTags.includes("tavern")) {
		return ["warm lamplight", "murmured gossip", "ale and smoke"];
	}
	if (
		args.locationTags.includes("investigation-site") ||
		DISAPPEARANCE_PATTERN.test(args.locationName) ||
		DISAPPEARANCE_PATTERN.test(args.action)
	) {
		return ["cold night air", "unnatural silence", "disturbed ground"];
	}
	if (args.intent === "travel") {
		return ["night air", "distant wind", "unfamiliar quiet"];
	}
	return args.existing;
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
	dryRun?: boolean;
}): Promise<PlayerActionOutput> {
	const bardoRoot = resolveBardoRoot(args.auth.campaignBasePath);
	const paths = resolvePlayerActionPaths(bardoRoot);
	const nowIso = args.nowIso ?? new Date().toISOString();
	const dryRun = args.dryRun ?? false;
	const guidedSetupEnabled =
		args.guidedSetupEnabled ?? resolveFeatureFlags(Bun.env).guidedSetupEnabled;
	const createdNpcIds: string[] = [];
	const createdLocationIds: string[] = [];
	const actionEventBase = canonicalPlayerActionEventBase(args.idempotencyKey);

	try {
		return await withKeyedLock(`workspace-mutation:${bardoRoot}`, async () => {
			if (!dryRun && args.idempotencyKey) {
				const replay = await getIdempotentResult({
					bardoRoot,
					key: args.idempotencyKey,
					scope: PLAYER_ACTION_SCOPE,
				});
				if (typeof replay === "object" && replay !== null) {
					return {
						...(replay as PlayerActionOutput),
						setupPrompt: (replay as PlayerActionOutput).setupPrompt ?? null,
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
					if (setupResult.question) {
						recordSetupLegacyFieldEmitMetric({
							source: "player_action",
							field: "setupQuestion",
						});
					}
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
						gmPacket: defaultGmPacket(),
						stateDelta: defaultStateDelta(),
						discoveryCandidates: [],
						canonicalEventIds: [],
						confidence: {
							narration: "low",
							discoveries: "low",
						},
						completeness: {
							gmPacket: false,
							contextReady: false,
						},
						mechanics: defaultMechanicsSummary(false),
						historyEntry: "",
						statePath: paths.statePath,
						historyPath: paths.historyPath,
						narrationGuardrails: [...narrationGuardrails],
						optionalSystems: { ...defaultOptionalSystems },
						requiresSetup: true,
						setupPrompt: setupResult.setupPrompt,
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
				if (!dryRun) {
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
				}
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
					gmPacket: defaultGmPacket(),
					stateDelta: defaultStateDelta(),
					discoveryCandidates: [],
					canonicalEventIds: [],
					confidence: {
						narration: "low",
						discoveries: "low",
					},
					completeness: {
						gmPacket: false,
						contextReady: false,
					},
					mechanics: defaultMechanicsSummary(false),
					historyEntry: "",
					statePath: paths.statePath,
					historyPath: paths.historyPath,
					narrationGuardrails: [...narrationGuardrails],
					optionalSystems,
					requiresSetup: false,
					setupPrompt: null,
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
				if (!dryRun && args.idempotencyKey) {
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
			if (!dryRun) {
				await ensurePlayerActionDirectories(bardoRoot, paths);
			}

			let preferredState: Awaited<ReturnType<typeof loadPreferredCurrentState>>;
			try {
				preferredState = await loadPreferredCurrentState({
					bardoRoot,
					consumer: "player_action",
					refreshStaleProjection: true,
				});
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.startsWith("STRICT_CANONICAL_LEGACY_FALLBACK_BLOCKED")
				) {
					if (dryRun) {
						throw error;
					}
					await regenerateCurrentStateProjection({ bardoRoot });
					preferredState = await loadPreferredCurrentState({
						bardoRoot,
						consumer: "player_action",
						refreshStaleProjection: true,
					});
				} else {
					throw error;
				}
			}
			const state = JSON.parse(
				JSON.stringify(preferredState.chosen.state),
			) as Awaited<
				ReturnType<typeof loadPreferredCurrentState>
			>["chosen"]["state"];
			const intent = parseIntent(actionToRun);
			const mechanicsRuleset = resolveWorkspaceRulesetId(preferredState);
			const mechanicsActionType = intentRequiresMechanics(intent, actionToRun)
				? resolveMechanicsActionType(intent, mechanicsRuleset)
				: null;
			let mechanicsAdapter: ReturnType<typeof resolveRulesetAdapter> | null =
				null;
			if (mechanicsActionType) {
				try {
					mechanicsAdapter = resolveRulesetAdapter(mechanicsRuleset);
				} catch (error) {
					const detail =
						error instanceof Error ? error.message : "Unsupported ruleset.";
					return {
						success: false,
						message: `Failed to process player action: ${detail}`,
						idempotentReplay: false,
						rootPath: bardoRoot,
						intent,
						timeAdvancedMinutes: 0,
						worldTimeBeforeISO: state.worldTimeISO,
						worldTimeAfterISO: state.worldTimeISO,
						locationBefore: state.currentLocation,
						locationAfter: state.currentLocation,
						createdNpcIds: [],
						createdLocationIds: [],
						gmPacket: defaultGmPacket(),
						stateDelta: defaultStateDelta(),
						discoveryCandidates: [],
						canonicalEventIds: [],
						confidence: {
							narration: "low",
							discoveries: "low",
						},
						completeness: {
							gmPacket: false,
							contextReady: true,
						},
						mechanics: {
							...defaultMechanicsSummary(true),
							ruleset: mechanicsRuleset,
							actionType: mechanicsActionType,
							unsupportedReason: detail,
						},
						historyEntry: "",
						statePath: paths.statePath,
						historyPath: paths.historyPath,
						narrationGuardrails: [],
						optionalSystems: { ...defaultOptionalSystems },
						requiresSetup: false,
						setupPrompt: null,
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
				}
			}
			if (mechanicsActionType && !mechanicsAdapter) {
				return {
					success: false,
					message: `Failed to process player action: no mechanics adapter is registered for required ruleset '${mechanicsRuleset}'.`,
					idempotentReplay: false,
					rootPath: bardoRoot,
					intent,
					timeAdvancedMinutes: 0,
					worldTimeBeforeISO: state.worldTimeISO,
					worldTimeAfterISO: state.worldTimeISO,
					locationBefore: state.currentLocation,
					locationAfter: state.currentLocation,
					createdNpcIds: [],
					createdLocationIds: [],
					gmPacket: defaultGmPacket(),
					stateDelta: defaultStateDelta(),
					discoveryCandidates: [],
					canonicalEventIds: [],
					confidence: {
						narration: "low",
						discoveries: "low",
					},
					completeness: {
						gmPacket: false,
						contextReady: true,
					},
					mechanics: {
						...defaultMechanicsSummary(true),
						ruleset: mechanicsRuleset,
						actionType: mechanicsActionType,
						unsupportedReason: `No adapter is registered for '${mechanicsRuleset}'.`,
					},
					historyEntry: "",
					statePath: paths.statePath,
					historyPath: paths.historyPath,
					narrationGuardrails: [],
					optionalSystems: { ...defaultOptionalSystems },
					requiresSetup: false,
					setupPrompt: null,
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
			}
			const canonicalEventIds: string[] = [];
			if (!dryRun) {
				const declaredEvent = await appendCanonicalEvent({
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
				canonicalEventIds.push(declaredEvent.id);
				const intentEvent = await appendCanonicalEvent({
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
				canonicalEventIds.push(intentEvent.id);
			}
			const locationBefore = state.currentLocation;
			const targetLocationText = extractTargetLocation(actionToRun);
			const disappearanceInvestigation =
				intent === "travel" &&
				isDisappearanceInvestigationTarget(targetLocationText);
			let locationAfter = state.currentLocation;
			let discoveryCandidates: DiscoveryCandidate[] = [];
			const inferredSemanticScene = inferSemanticSceneFromAction({
				action: actionToRun,
				currentLocation: locationBefore,
			});
			const semanticScene =
				inferredSemanticScene &&
				(intent !== "travel" ||
					!targetLocationText ||
					inferredSemanticScene.locationKeywords.some((keyword) =>
						targetLocationText.toLowerCase().includes(keyword),
					))
					? inferredSemanticScene
					: null;

			if (intent === "travel" && targetLocationText) {
				const resolved = disappearanceInvestigation
					? {
							slug: `disappearance-site-${resolveSceneAnchorSlug(locationBefore)}`,
							name: `Disappearance Site near ${resolveSceneAnchorName(locationBefore)}`,
						}
					: resolveTravelTarget(targetLocationText, knownLocations);
				const targetSlug = resolved.slug;
				locationAfter = targetSlug;
				if (!state.locations[targetSlug]) {
					state.locations[targetSlug] = {
						name: resolved.name,
						visits: 0,
						npcIds: [],
						tags: [],
						exits: [],
						activeClues: [],
						occupantIds: [],
					};
				}
				if (disappearanceInvestigation) {
					const location = state.locations[targetSlug];
					if (location) {
						if (!location.tags.includes("investigation-site")) {
							location.tags.push("investigation-site");
						}
						if (
							!location.activeClues.includes(
								"A disappearance trail leads away from this site.",
							)
						) {
							location.activeClues.push(
								"A disappearance trail leads away from this site.",
							);
						}
					}
					const threadId = investigationThreadId(locationBefore);
					const threadTitle = investigationThreadTitle(locationBefore);
					upsertThread(state, {
						id: threadId,
						title: threadTitle,
						status: "active",
						urgency: "high",
						summary: `People have been disappearing around ${resolveSceneAnchorName(locationBefore)}, and the party is tracing the site of the latest disappearance.`,
					});
					discoveryCandidates = mergeStructuredDiscoveries(
						discoveryCandidates,
						[
							{
								kind: "thread",
								id: threadId,
								displayName: threadTitle,
								discoveryMode: "implicitly_present",
								confidence: "high",
								summary:
									"The disappearances around town are now an active investigation thread.",
							},
							{
								kind: "clue",
								id: `${targetSlug}-trail`,
								displayName: "Disappearance trail",
								discoveryMode: "implicitly_present",
								confidence: "medium",
								summary:
									"The disappearance site still holds a physical trail worth following.",
								metadata: {
									locationId: targetSlug,
								},
							},
						],
					);
				}

				if (!dryRun && optionalSystems.worldGeneration) {
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
			if (semanticScene) {
				locationAfter = semanticScene.locationId;
				const semanticSync = syncStateForDiscoveries({
					state,
					locationId: semanticScene.locationId,
					locationName: semanticScene.locationName,
					locationTag: semanticScene.locationTag,
					placeholderNpcs: optionalSystems.npcs
						? semanticScene.placeholderNpcs
						: [],
				});
				createdLocationIds.push(...semanticSync.createdLocationIds);
				createdNpcIds.push(...semanticSync.createdNpcIds);
				discoveryCandidates = semanticScene.discoveries.filter(
					(discovery) => discovery.kind !== "npc" || optionalSystems.npcs,
				);
				if (!dryRun && optionalSystems.worldGeneration) {
					await ensureLocationFile({
						bardoRoot,
						locationSlug: semanticScene.locationId,
						locationName: semanticScene.locationName,
					});
					if (optionalSystems.npcs) {
						for (const npc of semanticScene.placeholderNpcs) {
							await ensureNpcFile({
								bardoRoot,
								npcId: npc.id,
								npcName: npc.displayName,
								currentLocation: semanticScene.locationId,
								role: npc.role,
							});
						}
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
					tags: [],
					exits: [],
					activeClues: [],
					occupantIds: [],
				};
				if (!dryRun && optionalSystems.worldGeneration) {
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

			const shouldSpawnAmbient =
				(intent === "travel" || intent === "explore") &&
				!locationRecord.tags.includes("investigation-site");
			if (shouldSpawnAmbient && optionalSystems.npcs && !semanticScene) {
				const existingAtLocation = locationRecord.npcIds.length;
				const desiredMinimum = 2;
				const toCreate = Math.max(0, desiredMinimum - existingAtLocation);
				for (let i = 0; i < toCreate; i += 1) {
					state.counters.unknownNpc += 1;
					const npc = dryRun
						? {
								id: `unknown_npc_${String(state.counters.unknownNpc).padStart(2, "0")}`,
								path: "",
							}
						: await createUnknownNpc({
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
			state.party.currentLocation = locationAfter;
			state.party.statusSummary = `The party is acting in ${locationRecord.name}.`;
			state.scene.summary = `The party is focused on ${locationRecord.name}.`;
			state.scene.activeSituation = `Resolve the consequences of: ${actionToRun}`;
			state.scene.sensoryCues = resolveSceneSensoryCues({
				locationTags: locationRecord.tags ?? [],
				intent,
				existing: state.scene.sensoryCues,
				locationName: locationRecord.name,
				action: actionToRun,
			});
			state.scene.unresolvedQuestions =
				discoveryCandidates.length > 0
					? discoveryCandidates
							.map((candidate) => candidate.summary)
							.slice(0, 3)
					: state.scene.unresolvedQuestions;
			state.mechanicsContext = {
				ruleset: mechanicsRuleset,
				difficultyHint:
					mechanicsActionType !== null
						? resolveTargetDifficulty({ intent, action: actionToRun })
						: null,
				combatActive: intent === "combat",
				initiativeOrder:
					intent === "combat" ? ["pc_party", ...locationRecord.npcIds] : [],
				advantageHints:
					intent === "social" && semanticScene
						? ["close conversation", "roleplay leverage available"]
						: [],
			};

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

				if (!dryRun && resolution.rolls.length > 0) {
					const diceEvent = await appendCanonicalEvent({
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
					canonicalEventIds.push(diceEvent.id);
				}
				if (!dryRun) {
					const mechanicsEvent = await appendCanonicalEvent({
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
					canonicalEventIds.push(mechanicsEvent.id);
				}
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
			const gmPacket = buildGmPacket({
				action: actionToRun,
				intent,
				locationBefore,
				locationAfter,
				locationAfterName: locationRecord.name,
				worldTimeAfterISO,
				timeAdvancedMinutes: advance,
				mechanics: {
					required: mechanics.required,
					resolved: mechanics.resolved,
					outcome: mechanics.outcome,
					total: mechanics.total,
					targetDifficulty: mechanics.targetDifficulty,
				},
				discoveries: discoveryCandidates,
				state,
			});
			if (!dryRun) {
				const resolvedEvent = await appendCanonicalEvent({
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
							discoveries: discoveryCandidates,
							stateAfter: state,
						},
					},
				});
				canonicalEventIds.push(resolvedEvent.id);
				await regenerateProjectionsForEventTypes({
					bardoRoot,
					eventTypes: ["player_action_resolved"],
					regenerateReports: false,
				});
			}
			const stateDelta: StateDelta = {
				worldTimeBeforeISO,
				worldTimeAfterISO,
				locationBefore,
				locationAfter,
				timeAdvancedMinutes: advance,
				createdNpcIds: [...createdNpcIds],
				createdLocationIds: [...createdLocationIds],
			};

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
				gmPacket,
				stateDelta,
				discoveryCandidates,
				canonicalEventIds,
				confidence: {
					narration: gmPacket.narrativeBeats.length >= 3 ? "high" : "medium",
					discoveries: discoveryCandidates.some(
						(candidate) => candidate.confidence === "high",
					)
						? "high"
						: discoveryCandidates.length > 0
							? "medium"
							: "low",
				},
				completeness: {
					gmPacket: gmPacket.narrativeBeats.length >= 3,
					contextReady: true,
				},
				mechanics,
				historyEntry,
				statePath: paths.statePath,
				historyPath: paths.historyPath,
				narrationGuardrails: [...narrationGuardrails],
				optionalSystems,
				requiresSetup: false,
				setupPrompt: null,
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

			if (!dryRun && args.idempotencyKey) {
				await setIdempotentResult({
					bardoRoot,
					key: args.idempotencyKey,
					scope: PLAYER_ACTION_SCOPE,
					result: output,
					nowIso,
				});
			}

			return output;
		});
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
			gmPacket: defaultGmPacket(),
			stateDelta: defaultStateDelta(),
			discoveryCandidates: [],
			canonicalEventIds: [],
			confidence: {
				narration: "low",
				discoveries: "low",
			},
			completeness: {
				gmPacket: false,
				contextReady: false,
			},
			mechanics: defaultMechanicsSummary(false),
			historyEntry: "",
			statePath: paths.statePath,
			historyPath: paths.historyPath,
			narrationGuardrails: [],
			optionalSystems: { ...defaultOptionalSystems },
			requiresSetup: false,
			setupPrompt: null,
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

function _registerPlayerActionTool(server: McpServer, auth: AuthContext): void {
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
