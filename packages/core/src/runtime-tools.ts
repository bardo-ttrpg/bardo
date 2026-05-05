import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { bootstrapCampaignWorkspace } from "./campaign-bootstrap";
import {
	applyStateChanges,
	buildBeforeAfterSummary,
	computeStateHash,
	createBlankCurrentState,
	createConflictRecord,
	createDiagnosticsManifest,
	createRuntimeEventId,
	createRuntimeTraceId,
	createSnapshotRecord,
	createValidationIssue,
	type EntityCatalog,
	findEntityId,
	findPotentialDuplicateEntities,
	mapToolNameToStoredEventType,
	mergeEntityRecords,
	migrateConflictManifestArtifact,
	migrateCurrentStateArtifact,
	migrateDiagnosticsManifestArtifact,
	migrateEntityCatalogArtifact,
	migrateSnapshotArtifact,
	migrateSnapshotIndexArtifact,
	normalizeConflictManifest,
	normalizeDiagnosticsManifest,
	normalizeEntityCatalog,
	normalizeEntityCatalogAliases,
	normalizeCurrentState as normalizeRuntimeCurrentState,
	normalizeSnapshotIndexManifest,
	normalizeSnapshotRecord,
	RUNTIME_ARTIFACT_PATHS,
	RUNTIME_SCHEMA_VERSION,
	type RuntimeCurrentState,
	type RuntimeEventRecord,
	type RuntimeTurnTraceRecord,
	type RuntimeValidationIssue,
	replaceEntityReferenceNames,
	splitEntityRecord,
	upsertEntityRecord,
	validateCurrentStateIntegrity,
	validateEntityCatalogIntegrity,
	validateSchemaVersion,
} from "./runtime-contracts";

type StateChangeEvent = {
	type: string;
	summary: string;
	changes: {
		currentLocation?: string | null;
		activeQuests?: string[];
		relevantFactions?: string[];
		recentEvents?: string[];
		uncertainties?: string[];
		factsRevealed?: string[];
		resourcesSpent?: string[];
		damageTaken?: string[];
		factionConsequences?: string[];
		npcAttitudes?: Record<string, string>;
		clockProgress?: string[];
		activeCorrections?: string[];
		removeFactsRevealed?: string[];
		removeRecentEvents?: string[];
		resolveConsequences?: string[];
	};
};

type RuntimeToolContext = {
	workspaceRoot: string;
	bardoRoot: string;
	nowIso?: string;
};

type RuntimeToolHandler = (
	args: Record<string, unknown>,
	context: RuntimeToolContext,
) => Promise<Record<string, unknown>>;

type CampaignEntities = {
	characters: string[];
	locations: string[];
	quests: string[];
	factions: string[];
	recentEvents: string[];
	facts: string[];
	clocks: string[];
};

type ReadinessStatus = "ready" | "ready-with-gaps" | "needs-user-input";

type ReadinessReport = {
	status: ReadinessStatus;
	gaps: string[];
};

type RuleIndexSection = {
	title: string;
	filename: string;
	summary: string;
	tags: string[];
	keywords: string[];
	parentHeading?: string;
	crossReferences?: string[];
};

type RuleIndex = {
	recommendedSimulationDepth: "light" | "standard" | "deep";
	sections: RuleIndexSection[];
};

type RelevantRule = {
	title: string;
	filename: string;
	summary: string;
	tags: string[];
	keywords: string[];
	matchedTerms: string[];
	score: number;
};

type RankedRelevantRule = RelevantRule & {
	directScore: number;
	tagScore: number;
};

type RuntimeArtifacts = {
	currentState: RuntimeCurrentState;
	entities: CampaignEntities;
	entityCatalog: EntityCatalog;
	trackingProfile: {
		strong: string[];
		light: string[];
		onDemand: string[];
	};
	readiness: ReadinessReport;
	rules: RuleIndex;
	consultedArtifacts: string[];
	precedence: string[];
	explicitCorrections: StateChangeEvent["changes"];
};

type ValidationResult = {
	validated: boolean;
	effectiveChanges: StateChangeEvent["changes"];
	conflicts: string[];
	conflictIds: string[];
	uncertainties: string[];
	issues: RuntimeValidationIssue[];
	consultedArtifacts: string[];
	precedence: string[];
};

type StructuredCorrection = {
	correctionType:
		| "replace_fact"
		| "downgrade_certainty"
		| "undo_bad_inference"
		| "merge_duplicate_entities"
		| "split_mistaken_merge"
		| "backdated_correction";
	targetEntityKind?: keyof EntityCatalog;
	targetEntityName?: string | null;
	mergeInto?: string | null;
	newEntityName?: string | null;
	newAliases?: string[];
	fieldName?: string | null;
	confidence?: "confirmed" | "validated-derived" | "probable" | "unresolved";
	supersedesEventId?: string | null;
	removeValues?: string[];
	resolvedConflictIds?: string[];
} | null;

type RuntimeDiagnosticsBundle = {
	diagnostics: Record<string, unknown>;
	conflicts: Record<string, unknown>;
	snapshotIndex: Record<string, unknown>;
	recentEvents: RuntimeEventRecord[];
	duplicateCandidates: ReturnType<typeof findPotentialDuplicateEntities>;
};

const CANON_PRECEDENCE = [
	"explicit user correction",
	"preserved source rules text",
	"current campaign source files",
	"approved committed state",
	"recent validated play result",
	"inference",
	"narration flavor",
] as const;

const RUNTIME_STOP_WORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"at",
	"before",
	"for",
	"from",
	"guidance",
	"how",
	"i",
	"in",
	"into",
	"is",
	"it",
	"need",
	"of",
	"on",
	"scene",
	"so",
	"staying",
	"the",
	"their",
	"them",
	"to",
	"toward",
	"true",
	"while",
	"with",
]);

const TERM_TO_TAGS = new Map<string, string[]>([
	["ambush", ["combat", "initiative", "attack"]],
	["attack", ["attack", "combat", "damage"]],
	["battle", ["combat", "attack", "initiative"]],
	["clue", ["core-resolution", "location"]],
	["combat", ["combat", "attack", "initiative", "damage", "defense"]],
	["crypt", ["location", "world"]],
	["door", ["core-resolution", "location"]],
	["doors", ["core-resolution", "location"]],
	["explore", ["core-resolution", "travel", "location"]],
	["exploration", ["core-resolution", "travel", "location"]],
	["faction", ["faction", "reputation"]],
	["fight", ["combat", "attack", "damage"]],
	["guild", ["faction", "reputation"]],
	["hidden", ["core-resolution", "location"]],
	["initiative", ["initiative", "combat"]],
	["investigate", ["core-resolution", "location"]],
	["journey", ["travel", "survival", "location"]],
	["mission", ["quest"]],
	["negotiate", ["social", "reputation", "faction"]],
	["objective", ["quest"]],
	["politics", ["faction", "reputation"]],
	["quest", ["quest"]],
	["renown", ["reputation", "social", "faction"]],
	["search", ["core-resolution", "location"]],
	["stealth", ["core-resolution", "combat"]],
	["survival", ["travel", "survival"]],
	["track", ["travel", "survival", "quest"]],
	["travel", ["travel", "survival", "location"]],
]);

export function createRuntimeToolHandlers(): Record<
	string,
	RuntimeToolHandler
> {
	return {
		init: async (_args, context) => {
			const nowIso = context.nowIso ?? new Date().toISOString();
			const result = await bootstrapCampaignWorkspace({
				workspaceRoot: context.workspaceRoot,
				bardoRoot: context.bardoRoot,
				nowIso,
			});
			return {
				success: true,
				readiness: result.readiness,
				artifacts: {
					sourceIndexPath: result.sourceIndexPath,
					currentStatePath: result.currentStatePath,
					trackingProfilePath: result.trackingProfilePath,
					readinessPath: result.readinessPath,
				},
			};
		},
		scene_turn: async (args, context) => {
			const playerIntent = asOptionalString(args.playerIntent) ?? "continue";
			const artifacts = await loadRuntimeArtifacts(context.bardoRoot);
			const guidance = deriveRuntimeGuidance(playerIntent, artifacts);
			const nextSteps = guidance.readinessGuidance.length
				? guidance.readinessGuidance
				: [
						"Use player_action to propose validated state changes and use user_correction when the player explicitly corrects canon.",
					];
			return {
				success: true,
				playerIntent,
				committed: false,
				canonChanged: false,
				confidence: "conservative",
				narration: buildSceneNarration({
					playerIntent,
					artifacts,
					guidance,
				}),
				currentState: artifacts.currentState,
				readiness: artifacts.readiness,
				relevantRules: guidance.relevantRules,
				gmGuidance: guidance.gmGuidance,
				readinessGuidance: guidance.readinessGuidance,
				simulationDepthRecommendation:
					artifacts.rules.recommendedSimulationDepth,
				consultedArtifacts: artifacts.consultedArtifacts,
				canonPrecedence: artifacts.precedence,
				nextSteps,
				mutationGuardrails: buildMutationGuardrails(),
				agentInstructions: buildAgentInstructions({
					mode: "conservative",
				}),
				commitPolicy: "Narrate freely. Commit conservatively.",
			};
		},
		player_action: async (args, context) => {
			const action = asOptionalString(args.action) ?? "unspecified action";
			const artifacts = await loadRuntimeArtifacts(context.bardoRoot);
			const guidance = deriveRuntimeGuidance(action, artifacts);
			const proposal = extractProposedChanges(args);
			if (hasProposedChanges(proposal)) {
				const nowIso = context.nowIso ?? new Date().toISOString();
				if (artifacts.readiness.status === "needs-user-input") {
					return {
						success: true,
						action,
						committed: false,
						canonChanged: false,
						confidence: "blocked",
						conflicts: [],
						conflictIds: [],
						uncertainties: [],
						readiness: artifacts.readiness,
						relevantRules: guidance.relevantRules,
						gmGuidance: guidance.gmGuidance,
						readinessGuidance: guidance.readinessGuidance,
						consultedArtifacts: artifacts.consultedArtifacts,
						canonPrecedence: artifacts.precedence,
						nextSteps: guidance.readinessGuidance,
						agentInstructions: buildAgentInstructions({
							mode: "blocked",
						}),
						validationSummary: buildValidationSummary({
							status: "blocked",
							conflicts: [],
							conflictIds: [],
							uncertainties: [],
							issues: [],
						}),
						commitPolicy:
							"Resolve readiness gaps before attempting canon-changing actions.",
					};
				}
				const validation = validateStateProposal({
					proposal,
					artifacts,
				});
				if (!validation.validated) {
					const conflictIds = await recordBlockedValidation({
						bardoRoot: context.bardoRoot,
						nowIso,
						toolName: "player_action",
						proposal,
						validation,
					});
					return {
						success: true,
						action,
						committed: false,
						canonChanged: false,
						confidence: "blocked",
						conflicts: validation.conflicts,
						conflictIds,
						uncertainties: validation.uncertainties,
						readiness: artifacts.readiness,
						relevantRules: guidance.relevantRules,
						gmGuidance: guidance.gmGuidance,
						readinessGuidance: guidance.readinessGuidance,
						consultedArtifacts: validation.consultedArtifacts,
						canonPrecedence: validation.precedence,
						nextSteps: buildNextSteps(validation, guidance.readinessGuidance),
						agentInstructions: buildAgentInstructions({
							mode: "blocked",
						}),
						validationSummary: buildValidationSummary({
							status: "blocked",
							conflicts: validation.conflicts,
							conflictIds,
							uncertainties: validation.uncertainties,
							issues: validation.issues,
						}),
					};
				}
				const event = {
					type: "player_action_resolved",
					summary: `Player action resolved: ${action}`,
					changes: validation.effectiveChanges,
				} satisfies StateChangeEvent;
				const commitResult = await commitStateChangingEvent({
					bardoRoot: context.bardoRoot,
					event,
					nowIso,
					toolName: "player_action",
					validated: true,
					canonBasis: "validated-play-result",
					consultedArtifacts: validation.consultedArtifacts,
					precedence: validation.precedence,
					conflicts: validation.conflicts,
					uncertainties: validation.uncertainties,
				});
				return {
					success: true,
					action,
					committed: true,
					canonChanged: true,
					confidence: "grounded",
					eventType: event.type,
					readiness: artifacts.readiness,
					relevantRules: guidance.relevantRules,
					gmGuidance: guidance.gmGuidance,
					consultedArtifacts: validation.consultedArtifacts,
					canonPrecedence: validation.precedence,
					conflicts: validation.conflicts,
					conflictIds: commitResult.conflictIds,
					uncertainties: validation.uncertainties,
					eventId: commitResult.eventId,
					stateHash: commitResult.stateHash,
					nextSteps: [
						"Continue play from the updated current state and keep future canon changes grounded in validated events.",
					],
					agentInstructions: buildAgentInstructions({
						mode: "committed",
					}),
					validationSummary: buildValidationSummary({
						status: "committed",
						conflicts: validation.conflicts,
						conflictIds: commitResult.conflictIds,
						uncertainties: validation.uncertainties,
						issues: validation.issues,
					}),
				};
			}
			return {
				success: true,
				action,
				committed: false,
				canonChanged: false,
				confidence: "conservative",
				readiness: artifacts.readiness,
				conflicts: [],
				conflictIds: [],
				uncertainties: [
					`Player action "${action}" does not become canon until a grounded state change is validated against the prep artifacts.`,
				],
				relevantRules: guidance.relevantRules,
				gmGuidance: guidance.gmGuidance,
				readinessGuidance: guidance.readinessGuidance,
				consultedArtifacts: artifacts.consultedArtifacts,
				canonPrecedence: artifacts.precedence,
				nextSteps: [
					"Keep narrating conservatively, or propose a grounded state change once the outcome is validated.",
					...guidance.readinessGuidance,
				],
				agentInstructions: buildAgentInstructions({
					mode: "conservative",
				}),
				validationSummary: buildValidationSummary({
					status: "conservative",
					conflicts: [],
					conflictIds: [],
					uncertainties: [
						`Player action "${action}" does not become canon until a grounded state change is validated against the prep artifacts.`,
					],
					issues: [],
				}),
				commitPolicy: "Narration is not canon by itself.",
			};
		},
		user_correction: async (args, context) => {
			const correction =
				asOptionalString(args.correction) ?? "Explicit user correction";
			const structuredCorrection = parseStructuredCorrection(args);
			const artifacts = await loadRuntimeArtifacts(context.bardoRoot, {
				allowAmbiguousEntityAliasesForCorrection:
					structuredCorrection?.correctionType === "merge_duplicate_entities" ||
					structuredCorrection?.correctionType === "split_mistaken_merge",
			});
			const proposal = extractProposedChanges(args);
			const nowIso = context.nowIso ?? new Date().toISOString();
			const correctionOps = await applyStructuredCorrection({
				bardoRoot: context.bardoRoot,
				artifacts,
				correction: structuredCorrection,
				nowIso,
			});
			const effectiveProposal = {
				...proposal,
				...correctionOps.extraChanges,
			};
			const correctionCatalog = ensureCatalogCoverageForExplicitCorrection({
				catalog:
					correctionOps.entityCatalogOverride ??
					normalizeEntityCatalogAliases(artifacts.entityCatalog),
				proposal: effectiveProposal,
			});
			const hasStructuredCorrection = hasProposedChanges(proposal);
			const validation = hasStructuredCorrection
				? validateStateProposal({
						proposal: effectiveProposal,
						artifacts: {
							...artifacts,
							entityCatalog: correctionCatalog,
							entities: flattenEntityCatalog(correctionCatalog),
						},
						allowExplicitCorrectionOverride: true,
					})
				: {
						validated: true,
						effectiveChanges: {},
						conflicts: [],
						conflictIds: [],
						uncertainties: [],
						issues: correctionOps.issues,
						consultedArtifacts: artifacts.consultedArtifacts,
						precedence: artifacts.precedence,
					};
			const mergedValidation = {
				...validation,
				issues: [...validation.issues, ...correctionOps.issues],
			};
			if (
				correctionOps.issues.length > 0 ||
				(!mergedValidation.validated && hasStructuredCorrection)
			) {
				const conflictIds = await recordBlockedValidation({
					bardoRoot: context.bardoRoot,
					nowIso,
					toolName: "user_correction",
					proposal: effectiveProposal,
					validation: mergedValidation,
				});
				return {
					success: true,
					correction,
					committed: false,
					canonChanged: false,
					confidence: "blocked",
					readiness: artifacts.readiness,
					conflicts: mergedValidation.conflicts,
					conflictIds,
					uncertainties: mergedValidation.uncertainties,
					consultedArtifacts: mergedValidation.consultedArtifacts,
					canonPrecedence: mergedValidation.precedence,
					nextSteps: buildNextSteps(mergedValidation, [
						"Provide grounded corrected fields, or restate the correction clearly so Bardo can durably record it as higher-precedence canon.",
					]),
					agentInstructions: buildAgentInstructions({
						mode: "blocked",
					}),
					validationSummary: buildValidationSummary({
						status: "blocked",
						conflicts: mergedValidation.conflicts,
						conflictIds,
						uncertainties: mergedValidation.uncertainties,
						issues: mergedValidation.issues,
					}),
				};
			}

			const event = {
				type: "user_correction_applied",
				summary: correction,
				changes: {
					...correctionOps.extraChanges,
					...mergedValidation.effectiveChanges,
					activeCorrections: unique([
						...artifacts.currentState.activeCorrections,
						correction,
					]),
				},
			} satisfies StateChangeEvent;
			const commitResult = await commitStateChangingEvent({
				bardoRoot: context.bardoRoot,
				event,
				nowIso,
				toolName: "user_correction",
				validated: true,
				canonBasis: "explicit-user-correction",
				consultedArtifacts: mergedValidation.consultedArtifacts,
				precedence: mergedValidation.precedence,
				conflicts: mergedValidation.conflicts,
				uncertainties: mergedValidation.uncertainties,
				currentStateOverride: correctionOps.currentStateOverride,
				entityCatalogOverride: correctionCatalog,
				resolvedConflictIds: correctionOps.resolvedConflictIds,
				additionalAffectedEntityIds: correctionOps.additionalAffectedEntityIds,
				supersedesEventIds: correctionOps.supersedesEventIds,
			});
			return {
				success: true,
				correction,
				committed: true,
				canonChanged: true,
				confidence: "corrected",
				eventType: "user_correction",
				readiness: artifacts.readiness,
				conflicts: mergedValidation.conflicts,
				conflictIds: commitResult.conflictIds,
				uncertainties: mergedValidation.uncertainties,
				eventId: commitResult.eventId,
				stateHash: commitResult.stateHash,
				consultedArtifacts: mergedValidation.consultedArtifacts,
				canonPrecedence: mergedValidation.precedence,
				correctionType: structuredCorrection?.correctionType ?? null,
				nextSteps: [
					"Continue play from the corrected canon and treat older conflicting facts as superseded until the user changes them again.",
				],
				agentInstructions: buildAgentInstructions({
					mode: "committed",
				}),
				validationSummary: buildValidationSummary({
					status: "committed",
					conflicts: mergedValidation.conflicts,
					conflictIds: commitResult.conflictIds,
					uncertainties: mergedValidation.uncertainties,
					issues: mergedValidation.issues,
				}),
			};
		},
		world_sync: async (args, context) => {
			const nowIso = context.nowIso ?? new Date().toISOString();
			const artifacts = await loadRuntimeArtifacts(context.bardoRoot, {
				requireReadyForMutation: true,
			});
			const validation = validateStateProposal({
				proposal: extractProposedChanges(args),
				artifacts,
			});
			if (!validation.validated) {
				const conflictIds = await recordBlockedValidation({
					bardoRoot: context.bardoRoot,
					nowIso,
					toolName: "world_sync",
					proposal: extractProposedChanges(args),
					validation,
				});
				return {
					success: true,
					committed: false,
					canonChanged: false,
					confidence: "blocked",
					readiness: artifacts.readiness,
					conflicts: validation.conflicts,
					conflictIds,
					uncertainties: validation.uncertainties,
					consultedArtifacts: validation.consultedArtifacts,
					canonPrecedence: validation.precedence,
					nextSteps: buildNextSteps(
						validation,
						deriveReadinessGuidance(artifacts.readiness),
					),
					agentInstructions: buildAgentInstructions({
						mode: "blocked",
					}),
					validationSummary: buildValidationSummary({
						status: "blocked",
						conflicts: validation.conflicts,
						conflictIds,
						uncertainties: validation.uncertainties,
						issues: validation.issues,
					}),
				};
			}

			const event = {
				type: "world_sync_applied",
				summary: "World sync applied.",
				changes: validation.effectiveChanges,
			} satisfies StateChangeEvent;
			const commitResult = await commitStateChangingEvent({
				bardoRoot: context.bardoRoot,
				event,
				nowIso,
				toolName: "world_sync",
				validated: true,
				canonBasis: "approved-resolved-consequence",
				consultedArtifacts: validation.consultedArtifacts,
				precedence: validation.precedence,
				conflicts: validation.conflicts,
				uncertainties: validation.uncertainties,
			});
			return {
				success: true,
				committed: true,
				canonChanged: true,
				confidence: "grounded",
				eventType: event.type,
				readiness: artifacts.readiness,
				consultedArtifacts: validation.consultedArtifacts,
				canonPrecedence: validation.precedence,
				conflicts: validation.conflicts,
				conflictIds: commitResult.conflictIds,
				uncertainties: validation.uncertainties,
				eventId: commitResult.eventId,
				stateHash: commitResult.stateHash,
				nextSteps: [
					"Use scene_turn or player_action from the updated current state.",
				],
				agentInstructions: buildAgentInstructions({
					mode: "committed",
				}),
				validationSummary: buildValidationSummary({
					status: "committed",
					conflicts: validation.conflicts,
					conflictIds: commitResult.conflictIds,
					uncertainties: validation.uncertainties,
					issues: validation.issues,
				}),
			};
		},
		simulation_tick: async (args, context) => {
			const tickLabel = asOptionalString(args.tickLabel) ?? "simulation tick";
			const artifacts = await loadRuntimeArtifacts(context.bardoRoot, {
				requireReadyForMutation: true,
			});
			const proposal = extractProposedChanges(args);
			if (hasProposedChanges(proposal)) {
				const validation = validateStateProposal({
					proposal,
					artifacts,
				});
				if (!validation.validated) {
					const nowIso = context.nowIso ?? new Date().toISOString();
					const conflictIds = await recordBlockedValidation({
						bardoRoot: context.bardoRoot,
						nowIso,
						toolName: "simulation_tick",
						proposal,
						validation,
					});
					return {
						success: true,
						tickLabel,
						committed: false,
						canonChanged: false,
						confidence: "blocked",
						readiness: artifacts.readiness,
						conflicts: validation.conflicts,
						conflictIds,
						uncertainties: validation.uncertainties,
						consultedArtifacts: validation.consultedArtifacts,
						canonPrecedence: validation.precedence,
						nextSteps: buildNextSteps(
							validation,
							deriveReadinessGuidance(artifacts.readiness),
						),
						agentInstructions: buildAgentInstructions({
							mode: "blocked",
						}),
						validationSummary: buildValidationSummary({
							status: "blocked",
							conflicts: validation.conflicts,
							conflictIds,
							uncertainties: validation.uncertainties,
							issues: validation.issues,
						}),
					};
				}
				const nowIso = context.nowIso ?? new Date().toISOString();
				const event = {
					type: "simulation_tick_applied",
					summary: tickLabel,
					changes: validation.effectiveChanges,
				} satisfies StateChangeEvent;
				const commitResult = await commitStateChangingEvent({
					bardoRoot: context.bardoRoot,
					event,
					nowIso,
					toolName: "simulation_tick",
					validated: true,
					canonBasis: "approved-resolved-consequence",
					consultedArtifacts: validation.consultedArtifacts,
					precedence: validation.precedence,
					conflicts: validation.conflicts,
					uncertainties: validation.uncertainties,
				});
				return {
					success: true,
					tickLabel,
					committed: true,
					canonChanged: true,
					confidence: "grounded",
					eventType: event.type,
					readiness: artifacts.readiness,
					consultedArtifacts: validation.consultedArtifacts,
					canonPrecedence: validation.precedence,
					conflicts: validation.conflicts,
					conflictIds: commitResult.conflictIds,
					uncertainties: validation.uncertainties,
					eventId: commitResult.eventId,
					stateHash: commitResult.stateHash,
					nextSteps: [
						"Inspect the updated current state before narrating the next turn.",
					],
					agentInstructions: buildAgentInstructions({
						mode: "committed",
					}),
					validationSummary: buildValidationSummary({
						status: "committed",
						conflicts: validation.conflicts,
						conflictIds: commitResult.conflictIds,
						uncertainties: validation.uncertainties,
						issues: validation.issues,
					}),
				};
			}
			return {
				success: true,
				tickLabel,
				committed: false,
				canonChanged: false,
				confidence: "conservative",
				readiness: artifacts.readiness,
				conflicts: [],
				conflictIds: [],
				uncertainties: [
					`Simulation tick "${tickLabel}" requires a separately validated state change before canon can advance.`,
				],
				consultedArtifacts: artifacts.consultedArtifacts,
				canonPrecedence: artifacts.precedence,
				nextSteps: [
					"Use simulation_tick with validated consequence fields or keep the change as non-canonical narration.",
				],
				agentInstructions: buildAgentInstructions({
					mode: "conservative",
				}),
				validationSummary: buildValidationSummary({
					status: "conservative",
					conflicts: [],
					conflictIds: [],
					uncertainties: [
						`Simulation tick "${tickLabel}" requires a separately validated state change before canon can advance.`,
					],
					issues: [],
				}),
				commitPolicy: "Narration is not canon by itself.",
			};
		},
	};
}

function buildAgentInstructions(args: {
	mode: "blocked" | "conservative" | "committed";
}): string[] {
	if (args.mode === "blocked") {
		return [
			"Do not narrate blocked proposals as established fact.",
			"Treat the blocked outcome as unverified until a grounded artifact, validated event, or higher-precedence correction supports it.",
			"Ask for clarification or keep the response explicitly hypothetical instead of promoting rejected details into canon.",
		];
	}

	if (args.mode === "committed") {
		return [
			"Only the committed validated changes and the updated current state count as canon.",
			"Prefer the committed event and current-state fields over earlier conflicting narration.",
		];
	}

	return [
		"Treat narration as provisional scene guidance, not as a canon update by itself.",
		"Only validated committed changes can become durable truth.",
	];
}

function buildMutationGuardrails(): string[] {
	return [
		"Use world_sync and simulation_tick only for facts already grounded in current state, source artifacts, committed events, or explicit user correction.",
		"Do not invent plausible follow-on recentEvents, faction moves, NPC reactions, or location changes just because they sound likely.",
		"If the user is introducing new canon, use user_correction instead of world_sync or simulation_tick.",
		"If an outcome is only a reasonable guess, keep it in narration and leave canon unchanged.",
	];
}

function buildValidationSummary(args: {
	status: "committed" | "blocked" | "conservative";
	conflicts: string[];
	conflictIds: string[];
	uncertainties: string[];
	issues?: RuntimeValidationIssue[];
}): {
	status: "committed" | "blocked" | "conservative";
	blockedReasons: string[];
	conflictIds: string[];
	issueCodes: string[];
} {
	return {
		status: args.status,
		blockedReasons: unique([...args.conflicts, ...args.uncertainties]),
		conflictIds: args.conflictIds,
		issueCodes: unique((args.issues ?? []).map((issue) => issue.code)),
	};
}

async function recordBlockedValidation(args: {
	bardoRoot: string;
	nowIso: string;
	toolName: string;
	proposal: StateChangeEvent["changes"];
	validation: Pick<
		ValidationResult,
		| "conflicts"
		| "uncertainties"
		| "consultedArtifacts"
		| "issues"
		| "precedence"
	>;
}): Promise<string[]> {
	const conflictRecords = createConflictRecordsFromMessages({
		conflicts: args.validation.conflicts,
		issues: args.validation.issues,
		nowIso: args.nowIso,
		proposal: args.proposal,
	});
	await persistConflictRecords({
		bardoRoot: args.bardoRoot,
		conflicts: conflictRecords,
		nowIso: args.nowIso,
	});
	await updateDiagnosticsForBlockedValidation({
		bardoRoot: args.bardoRoot,
		nowIso: args.nowIso,
		conflictIds: conflictRecords.map((entry) => entry.conflictId),
	});
	await appendTurnTrace({
		bardoRoot: args.bardoRoot,
		record: {
			schemaVersion: RUNTIME_SCHEMA_VERSION,
			traceId: createRuntimeTraceId(),
			toolName: args.toolName,
			atISO: args.nowIso,
			consultedArtifacts: args.validation.consultedArtifacts,
			relevantRules: [],
			proposedChanges: args.proposal,
			precedenceDecisions: args.validation.precedence,
			validationIssues: args.validation.issues,
			validationSummary: {
				status: "blocked",
				blockedReasons: unique([
					...args.validation.conflicts,
					...args.validation.uncertainties,
				]),
				conflictIds: conflictRecords.map((entry) => entry.conflictId),
				issueCodes: Array.from(
					new Set(args.validation.issues.map((issue) => issue.code)),
				),
			},
			commitResult: null,
		},
	});
	return conflictRecords.map((entry) => entry.conflictId);
}

async function updateDiagnosticsForBlockedValidation(args: {
	bardoRoot: string;
	nowIso: string;
	conflictIds: string[];
}): Promise<void> {
	const createDefaultDiagnostics = () =>
		createDiagnosticsManifest({
			updatedAtISO: args.nowIso,
			readinessStatus: null,
			latestEventId: null,
			latestStateHash: null,
			latestSnapshotId: null,
			latestSnapshotPath: null,
			snapshotCount: 0,
			activeConflictIds: [],
			recentEventIds: [],
			correctionEventIds: [],
			integrity: {
				status: "valid",
				currentStateHash: null,
				eventLogHash: null,
				latestSnapshotHash: null,
			},
			replayStatus: {
				canReplayFromEventZero: true,
				canReplayFromLatestSnapshot: false,
				lastReplayMode: null,
			},
		});
	const diagnosticsPath = path.join(
		args.bardoRoot,
		RUNTIME_ARTIFACT_PATHS.diagnostics,
	);
	const diagnostics = await readFile(diagnosticsPath, "utf8")
		.then((raw) => {
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			if (typeof parsed.schemaVersion !== "number") {
				return createDefaultDiagnostics();
			}
			return migrateDiagnosticsManifestArtifact(parsed);
		})
		.catch(() => createDefaultDiagnostics());
	await mkdir(path.dirname(diagnosticsPath), { recursive: true });
	await writeFile(
		diagnosticsPath,
		JSON.stringify(
			{
				...diagnostics,
				updatedAtISO: args.nowIso,
				activeConflictIds: unique([
					...diagnostics.activeConflictIds,
					...args.conflictIds,
				]),
			},
			null,
			2,
		),
		"utf8",
	);
}

export async function commitStateChangingEvent(args: {
	bardoRoot: string;
	event: StateChangeEvent;
	nowIso: string;
	toolName?: string;
	validated?: boolean;
	consultedArtifacts?: string[];
	canonBasis?: string;
	precedence?: string[];
	conflicts?: string[];
	uncertainties?: string[];
	currentStateOverride?: RuntimeCurrentState;
	entityCatalogOverride?: EntityCatalog;
	resolvedConflictIds?: string[];
	additionalAffectedEntityIds?: string[];
	supersedesEventIds?: string[];
}): Promise<{
	eventId: string;
	stateHash: string;
	conflictIds: string[];
}> {
	if (args.validated !== true) {
		throw new Error(
			"Only validated state-changing events can be committed to canon.",
		);
	}

	const statePath = path.join(args.bardoRoot, "state/current-state.json");
	const eventLogPath = path.join(args.bardoRoot, "events/state-changes.ndjson");
	const entitiesPath = path.join(
		args.bardoRoot,
		"entities/campaign-entities.json",
	);
	const entityCatalog =
		args.entityCatalogOverride ??
		normalizeEntityCatalog(
			await readJsonFile<Record<string, unknown>>(
				entitiesPath,
				"campaign entities",
			),
		);
	const currentState =
		args.currentStateOverride ??
		(await loadCurrentState(args.bardoRoot, entityCatalog));
	const preCommitIssues = [
		...validateEntityCatalogIntegrity(entityCatalog),
		...validateCurrentStateIntegrity({
			currentState,
			catalog: entityCatalog,
			nowIso: args.nowIso,
		}),
	];
	if (preCommitIssues.length > 0) {
		throw new Error(
			`Runtime invariant violation detected before commit: ${preCommitIssues
				.map((issue) => issue.message)
				.join(" ")}`,
		);
	}
	const existingEvents = await readEventLogRecords(eventLogPath);
	const causalParentEventId =
		existingEvents[existingEvents.length - 1]?.eventId ?? null;
	const eventId = createRuntimeEventId();
	const storedEventType = mapToolNameToStoredEventType({
		toolName: args.toolName,
		canonBasis: args.canonBasis,
	});
	const nextState = applyStateChanges({
		currentState,
		changes: args.event.changes,
		nowIso: args.nowIso,
		eventId,
		catalog: entityCatalog,
		sourceType:
			args.canonBasis === "explicit-user-correction"
				? "user-correction"
				: "validated-event",
		sourcePath: null,
		actor: args.toolName ?? args.event.type,
		correctionEventId:
			args.canonBasis === "explicit-user-correction" ? eventId : null,
	});
	const postCommitIssues = validateCurrentStateIntegrity({
		currentState: nextState,
		catalog: entityCatalog,
		nowIso: args.nowIso,
	});
	if (postCommitIssues.length > 0) {
		throw new Error(
			`Runtime invariant violation detected after commit preparation: ${postCommitIssues
				.map((issue) => issue.message)
				.join(" ")}`,
		);
	}
	const stateHashBefore = computeStateHash(currentState);
	const stateHashAfter = computeStateHash(nextState);
	const conflictIds = createConflictRecordsFromMessages({
		conflicts: args.conflicts ?? [],
		issues: [],
		nowIso: args.nowIso,
		proposal: args.event.changes,
	}).map((entry) => entry.conflictId);
	const eventRecord: RuntimeEventRecord = {
		schemaVersion: RUNTIME_SCHEMA_VERSION,
		type: args.event.type,
		eventId,
		eventType: storedEventType,
		actorType: "runtime-tool",
		actorSource: args.toolName ?? args.event.type,
		atISO: args.nowIso,
		causalParentEventId,
		affectedEntityIds: deriveAffectedEntityIds({
			catalog: entityCatalog,
			changes: args.event.changes,
		}).concat(args.additionalAffectedEntityIds ?? []),
		summary: args.event.summary,
		beforeAfterSummary: buildBeforeAfterSummary({
			currentState,
			nextState,
		}),
		changes: args.event.changes,
		validated: true,
		canonBasis: args.canonBasis ?? "campaign-artifacts",
		consultedArtifacts: args.consultedArtifacts ?? [],
		precedence: args.precedence ?? [...CANON_PRECEDENCE],
		conflictIds,
		conflicts: args.conflicts ?? [],
		uncertainties: args.uncertainties ?? [],
		stateHashBefore,
		stateHashAfter,
		correctionLinkage:
			args.canonBasis === "explicit-user-correction"
				? {
						supersedesEventIds:
							(args.supersedesEventIds ?? []).length > 0
								? (args.supersedesEventIds ?? [])
								: causalParentEventId
									? [causalParentEventId]
									: [],
					}
				: null,
	};

	await mkdir(path.dirname(statePath), { recursive: true });
	await mkdir(path.dirname(eventLogPath), { recursive: true });
	await mkdir(path.dirname(entitiesPath), { recursive: true });
	await writeFile(
		entitiesPath,
		JSON.stringify(
			{
				schemaVersion: RUNTIME_SCHEMA_VERSION,
				characters: entityCatalog.characters.map((entry) => entry.name),
				locations: entityCatalog.locations.map((entry) => entry.name),
				quests: entityCatalog.quests.map((entry) => entry.name),
				factions: entityCatalog.factions.map((entry) => entry.name),
				recentEvents: entityCatalog.recentEvents.map((entry) => entry.name),
				facts: entityCatalog.facts.map((entry) => entry.name),
				clocks: entityCatalog.clocks.map((entry) => entry.name),
				records: entityCatalog,
			},
			null,
			2,
		),
		"utf8",
	);
	await writeFile(statePath, JSON.stringify(nextState, null, 2), "utf8");
	const existingLog = await readFile(eventLogPath, "utf8").catch(() => "");
	const nextLine = JSON.stringify(eventRecord);
	await writeFile(
		eventLogPath,
		existingLog.length > 0
			? `${existingLog.trimEnd()}\n${nextLine}\n`
			: `${nextLine}\n`,
		"utf8",
	);

	await persistConflictRecords({
		bardoRoot: args.bardoRoot,
		conflicts: createConflictRecordsFromMessages({
			conflicts: args.conflicts ?? [],
			issues: [],
			nowIso: args.nowIso,
			proposal: args.event.changes,
		}),
		nowIso: args.nowIso,
		resolvedConflictIds: args.resolvedConflictIds ?? [],
	});
	await writeSupportArtifacts({
		bardoRoot: args.bardoRoot,
		nowIso: args.nowIso,
		currentState: nextState,
		latestEvent: eventRecord,
		eventCount: existingEvents.length + 1,
		readinessStatus: null,
	});
	await appendTurnTrace({
		bardoRoot: args.bardoRoot,
		record: {
			schemaVersion: RUNTIME_SCHEMA_VERSION,
			traceId: createRuntimeTraceId(),
			toolName: args.toolName ?? args.event.type,
			atISO: args.nowIso,
			consultedArtifacts: args.consultedArtifacts ?? [],
			relevantRules: [],
			proposedChanges: args.event.changes,
			precedenceDecisions: args.precedence ?? [...CANON_PRECEDENCE],
			validationIssues: [],
			validationSummary: {
				status: "committed",
				blockedReasons: [],
				conflictIds,
				issueCodes: [],
			},
			commitResult: {
				eventId,
				stateHash: stateHashAfter,
			},
		},
	});
	return {
		eventId,
		stateHash: stateHashAfter,
		conflictIds,
	};
}

async function loadRuntimeArtifacts(
	bardoRoot: string,
	options: {
		requireReadyForMutation?: boolean;
		allowAmbiguousEntityAliasesForCorrection?: boolean;
	} = {},
): Promise<RuntimeArtifacts> {
	const rulesIndexPath = path.join(bardoRoot, "rules/normalized/index.json");
	const entitiesPath = path.join(bardoRoot, "entities/campaign-entities.json");
	const readinessPath = path.join(bardoRoot, "manifests/readiness.json");
	const currentStatePath = path.join(bardoRoot, "state/current-state.json");
	const trackingProfilePath = path.join(
		bardoRoot,
		"simulation/tracking-profile.json",
	);
	const eventLogPath = path.join(bardoRoot, "events/state-changes.ndjson");

	const rules = normalizeRuleIndex(
		await readJsonFile<Record<string, unknown>>(
			rulesIndexPath,
			"rules bootstrap index",
		),
		rulesIndexPath,
	);
	const entitiesRaw = await readJsonFile<Record<string, unknown>>(
		entitiesPath,
		"campaign entities",
	);
	const entities = normalizeEntities(entitiesRaw);
	const entityCatalog = migrateEntityCatalogArtifact(entitiesRaw);
	const readiness = normalizeReadiness(
		await readJsonFile<Partial<ReadinessReport>>(
			readinessPath,
			"readiness report",
		),
		readinessPath,
	);
	const trackingProfile = normalizeTrackingProfile(
		await readJsonFile<Record<string, unknown>>(
			trackingProfilePath,
			"tracking profile",
		),
		trackingProfilePath,
	);
	const currentState = migrateCurrentStateArtifact({
		raw: await readJsonFile<Record<string, unknown>>(
			currentStatePath,
			"current state",
		),
		catalog: entityCatalog,
		nowIso: null,
	});
	const invariantIssues = [
		...validateEntityCatalogIntegrity(entityCatalog),
		...validateCurrentStateIntegrity({
			currentState,
			catalog: entityCatalog,
			nowIso: null,
		}),
	];
	const blockingInvariantIssues =
		options.allowAmbiguousEntityAliasesForCorrection
			? invariantIssues.filter(
					(issue) => issue.code !== "ambiguous_entity_alias",
				)
			: invariantIssues;
	if (blockingInvariantIssues.length > 0) {
		throw new Error(
			`Runtime artifact corruption detected in ${bardoRoot}: ${blockingInvariantIssues
				.map((issue) => issue.message)
				.join(" ")}`,
		);
	}
	const explicitCorrections = await loadExplicitCorrections(eventLogPath);

	if (
		options.requireReadyForMutation &&
		readiness.status === "needs-user-input"
	) {
		throw new Error(
			"Campaign readiness is needs-user-input. Finish bootstrap gaps before committing canon.",
		);
	}

	return {
		currentState,
		entities,
		entityCatalog,
		trackingProfile,
		readiness,
		rules,
		consultedArtifacts: [
			"rules/normalized/index.json",
			"entities/campaign-entities.json",
			"manifests/readiness.json",
			"simulation/tracking-profile.json",
			"state/current-state.json",
			"events/state-changes.ndjson",
		],
		precedence: [...CANON_PRECEDENCE],
		explicitCorrections,
	};
}

async function loadCurrentState(
	bardoRoot: string,
	entityCatalog: EntityCatalog,
): Promise<RuntimeCurrentState> {
	const currentStatePath = path.join(bardoRoot, "state/current-state.json");
	return migrateCurrentStateArtifact({
		raw: await readJsonFile<Record<string, unknown>>(
			currentStatePath,
			"current state",
		),
		catalog: entityCatalog,
		nowIso: null,
	});
}

async function readJsonFile<T>(filePath: string, label: string): Promise<T> {
	const raw = await readFile(filePath, "utf8").catch((error: unknown) => {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			throw new Error(
				`Missing required runtime artifact (${label}) at ${filePath}. Run bardo init before using runtime tools.`,
			);
		}
		throw error;
	});

	try {
		return JSON.parse(raw) as T;
	} catch (error) {
		throw new Error(
			`Runtime artifact corruption detected in ${filePath}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

function normalizeTrackingProfile(
	raw: Record<string, unknown>,
	_filePath: string,
): {
	strong: string[];
	light: string[];
	onDemand: string[];
} {
	validateSchemaVersion(raw.schemaVersion, { allowMissing: true });
	return {
		strong: toStringArray(raw.strong),
		light: toStringArray(raw.light),
		onDemand: toStringArray(raw.onDemand),
	};
}

function normalizeEntities(
	raw: Partial<CampaignEntities> & {
		records?: Partial<EntityCatalog>;
	},
): CampaignEntities {
	validateSchemaVersion((raw as Record<string, unknown>).schemaVersion, {
		allowMissing: true,
	});
	const catalog = normalizeEntityCatalog({ records: raw.records });
	return {
		characters:
			toStringArray(raw.characters).length > 0
				? toStringArray(raw.characters)
				: catalog.characters.map((entry) => entry.name),
		locations:
			toStringArray(raw.locations).length > 0
				? toStringArray(raw.locations)
				: catalog.locations.map((entry) => entry.name),
		quests:
			toStringArray(raw.quests).length > 0
				? toStringArray(raw.quests)
				: catalog.quests.map((entry) => entry.name),
		factions:
			toStringArray(raw.factions).length > 0
				? toStringArray(raw.factions)
				: catalog.factions.map((entry) => entry.name),
		recentEvents:
			toStringArray(raw.recentEvents).length > 0
				? toStringArray(raw.recentEvents)
				: catalog.recentEvents.map((entry) => entry.name),
		facts:
			toStringArray(raw.facts).length > 0
				? toStringArray(raw.facts)
				: catalog.facts.map((entry) => entry.name),
		clocks:
			toStringArray(raw.clocks).length > 0
				? toStringArray(raw.clocks)
				: catalog.clocks.map((entry) => entry.name),
	};
}

function normalizeReadiness(
	raw: Partial<ReadinessReport>,
	filePath: string,
): ReadinessReport {
	validateSchemaVersion((raw as Record<string, unknown>).schemaVersion, {
		allowMissing: true,
	});
	if (
		raw.status !== "ready" &&
		raw.status !== "ready-with-gaps" &&
		raw.status !== "needs-user-input"
	) {
		throw new Error(
			`Runtime artifact corruption detected in ${filePath}: invalid readiness status.`,
		);
	}

	return {
		status: raw.status,
		gaps: toStringArray(raw.gaps),
	};
}

function normalizeRuleIndex(
	raw: Record<string, unknown>,
	filePath: string,
): RuleIndex {
	validateSchemaVersion(raw.schemaVersion, {
		allowMissing: true,
	});
	const recommendedSimulationDepth = raw.recommendedSimulationDepth;
	if (
		recommendedSimulationDepth !== "light" &&
		recommendedSimulationDepth !== "standard" &&
		recommendedSimulationDepth !== "deep"
	) {
		throw new Error(
			`Runtime artifact corruption detected in ${filePath}: invalid simulation depth recommendation.`,
		);
	}

	const sections = Array.isArray(raw.sections)
		? raw.sections.map((section) => normalizeRuleSection(section, filePath))
		: [];
	return {
		recommendedSimulationDepth,
		sections,
	};
}

function normalizeRuleSection(
	value: unknown,
	filePath: string,
): RuleIndexSection {
	if (typeof value !== "object" || value === null) {
		throw new Error(
			`Runtime artifact corruption detected in ${filePath}: invalid rule section entry.`,
		);
	}

	const section = value as Record<string, unknown>;
	const title = asOptionalString(section.title);
	const filename = asOptionalString(section.filename);
	const summary = asOptionalString(section.summary);
	if (!title || !filename || !summary) {
		throw new Error(
			`Runtime artifact corruption detected in ${filePath}: rule sections require title, filename, and summary.`,
		);
	}

	return {
		title,
		filename,
		summary,
		tags: toStringArray(section.tags).map(normalizeKey),
		keywords: toStringArray(section.keywords).map(normalizeKey),
		...(asOptionalString(section.parentHeading)
			? { parentHeading: asOptionalString(section.parentHeading) ?? undefined }
			: {}),
		...(Array.isArray(section.crossReferences)
			? { crossReferences: toStringArray(section.crossReferences) }
			: {}),
	};
}

function validateStateProposal(args: {
	proposal: StateChangeEvent["changes"];
	artifacts: RuntimeArtifacts;
	allowExplicitCorrectionOverride?: boolean;
}): ValidationResult {
	const effectiveChanges: StateChangeEvent["changes"] = {};
	const conflicts: string[] = [];
	const uncertainties: string[] = [];
	const issues: RuntimeValidationIssue[] = [];
	const proposal = args.proposal;
	if (!hasProposedChanges(proposal)) {
		const message = "No grounded state change was proposed for validation.";
		uncertainties.push(message);
		issues.push(
			createValidationIssue({
				code: "no_changes_proposed",
				fieldName: null,
				message,
			}),
		);
	}

	for (const conflict of detectExplicitCorrectionConflicts({
		proposal,
		explicitCorrections: args.artifacts.explicitCorrections,
		allowExplicitCorrectionOverride:
			args.allowExplicitCorrectionOverride ?? false,
	})) {
		conflicts.push(conflict);
		issues.push(
			createValidationIssue({
				code: "explicit_correction_conflict",
				fieldName: inferConflictFieldName(conflict),
				message: conflict,
			}),
		);
	}

	if (proposal.currentLocation) {
		const knownLocations = new Set(
			args.artifacts.entities.locations.map((value) => normalizeKey(value)),
		);
		if (
			!knownLocations.has(normalizeKey(proposal.currentLocation)) &&
			!args.allowExplicitCorrectionOverride
		) {
			const conflict = `Current location "${proposal.currentLocation}" is not present in campaign artifacts.`;
			const uncertainty = `Refusing to commit "${proposal.currentLocation}" because it is not grounded in the campaign prep artifacts.`;
			conflicts.push(conflict);
			uncertainties.push(uncertainty);
			issues.push(
				createValidationIssue({
					code: "unknown_location",
					fieldName: "currentLocation",
					message: conflict,
				}),
			);
		} else if (
			proposal.currentLocation !== args.artifacts.currentState.currentLocation
		) {
			effectiveChanges.currentLocation = proposal.currentLocation;
		}
	}

	if (proposal.activeQuests) {
		const knownQuests = new Set(
			args.artifacts.entities.quests.map((value) => normalizeKey(value)),
		);
		const unknownQuests = proposal.activeQuests.filter(
			(value) => !knownQuests.has(normalizeKey(value)),
		);
		if (unknownQuests.length > 0 && !args.allowExplicitCorrectionOverride) {
			const message = `Active quest proposals are not grounded in campaign artifacts: ${unknownQuests.join(", ")}.`;
			conflicts.push(message);
			issues.push(
				...unknownQuests.map((quest) =>
					createValidationIssue({
						code: "unknown_quest",
						fieldName: "activeQuests",
						message: `Unknown quest proposal: ${quest}.`,
					}),
				),
			);
		} else if (
			!sameStringArray(
				proposal.activeQuests,
				args.artifacts.currentState.activeQuests,
			)
		) {
			effectiveChanges.activeQuests = proposal.activeQuests;
		}
	}

	if (proposal.relevantFactions) {
		const knownFactions = new Set(
			args.artifacts.entities.factions.map((value) => normalizeKey(value)),
		);
		const unknownFactions = proposal.relevantFactions.filter(
			(value) => !knownFactions.has(normalizeKey(value)),
		);
		if (unknownFactions.length > 0 && !args.allowExplicitCorrectionOverride) {
			const message = `Faction proposals are not grounded in campaign artifacts: ${unknownFactions.join(", ")}.`;
			conflicts.push(message);
			issues.push(
				...unknownFactions.map((faction) =>
					createValidationIssue({
						code: "unknown_faction",
						fieldName: "relevantFactions",
						message: `Unknown faction proposal: ${faction}.`,
					}),
				),
			);
		} else if (
			!sameStringArray(
				proposal.relevantFactions,
				args.artifacts.currentState.relevantFactions,
			)
		) {
			effectiveChanges.relevantFactions = proposal.relevantFactions;
		}
	}

	if (proposal.recentEvents) {
		const knownEvents = new Set(
			args.artifacts.entities.recentEvents.map((value) => normalizeKey(value)),
		);
		const unknownEvents = proposal.recentEvents.filter(
			(value) => !knownEvents.has(normalizeKey(value)),
		);
		if (unknownEvents.length > 0 && !args.allowExplicitCorrectionOverride) {
			const message = `Recent event proposals are not grounded in campaign artifacts: ${unknownEvents.join(", ")}.`;
			conflicts.push(message);
			issues.push(
				...unknownEvents.map((event) =>
					createValidationIssue({
						code: "unknown_recent_event",
						fieldName: "recentEvents",
						message: `Unknown recent event proposal: ${event}.`,
					}),
				),
			);
		} else if (
			!sameStringArray(
				proposal.recentEvents,
				args.artifacts.currentState.recentEvents,
			)
		) {
			effectiveChanges.recentEvents = proposal.recentEvents;
		}
	}

	if (proposal.factsRevealed) {
		const knownFacts = new Set(
			args.artifacts.entities.facts.map((value) => normalizeKey(value)),
		);
		const unknownFacts = proposal.factsRevealed.filter(
			(value) => knownFacts.size > 0 && !knownFacts.has(normalizeKey(value)),
		);
		if (unknownFacts.length > 0 && !args.allowExplicitCorrectionOverride) {
			const message = `Revealed facts are not grounded in campaign artifacts: ${unknownFacts.join(", ")}.`;
			conflicts.push(message);
			issues.push(
				...unknownFacts.map((fact) =>
					createValidationIssue({
						code: "unknown_fact",
						fieldName: "factsRevealed",
						message: `Unknown fact proposal: ${fact}.`,
					}),
				),
			);
		} else {
			effectiveChanges.factsRevealed = proposal.factsRevealed;
		}
	}

	if (proposal.factionConsequences) {
		const knownFactions = args.artifacts.entities.factions.map((value) =>
			normalizeKey(value),
		);
		const unknownConsequences = proposal.factionConsequences.filter(
			(value) =>
				knownFactions.length > 0 &&
				!knownFactions.some((faction) => normalizeKey(value).includes(faction)),
		);
		if (
			unknownConsequences.length > 0 &&
			!args.allowExplicitCorrectionOverride
		) {
			const message = `Faction consequences must name a grounded faction: ${unknownConsequences.join(", ")}.`;
			conflicts.push(message);
			issues.push(
				...unknownConsequences.map((consequence) =>
					createValidationIssue({
						code: "unknown_consequence_faction",
						fieldName: "factionConsequences",
						message: `Faction consequence is missing a grounded faction: ${consequence}.`,
					}),
				),
			);
		} else {
			effectiveChanges.factionConsequences = proposal.factionConsequences;
		}
	}

	if (proposal.npcAttitudes) {
		const knownCharacters = new Set(
			args.artifacts.entities.characters.map((value) => normalizeKey(value)),
		);
		const unknownCharacters = Object.keys(proposal.npcAttitudes).filter(
			(name) => !knownCharacters.has(normalizeKey(name)),
		);
		if (unknownCharacters.length > 0 && !args.allowExplicitCorrectionOverride) {
			const message = `NPC attitude updates require grounded characters: ${unknownCharacters.join(", ")}.`;
			conflicts.push(message);
			issues.push(
				...unknownCharacters.map((character) =>
					createValidationIssue({
						code: "unknown_character",
						fieldName: "npcAttitudes",
						message: `Unknown character proposal: ${character}.`,
					}),
				),
			);
		} else if (
			!sameStringRecord(
				proposal.npcAttitudes,
				args.artifacts.currentState.npcAttitudes,
			)
		) {
			effectiveChanges.npcAttitudes = proposal.npcAttitudes;
		}
	}

	if (proposal.clockProgress) {
		const knownClocks = args.artifacts.entities.clocks.map((value) =>
			normalizeKey(value),
		);
		const unknownClocks = proposal.clockProgress.filter(
			(value) =>
				knownClocks.length > 0 &&
				!knownClocks.some((clock) => normalizeKey(value).includes(clock)),
		);
		if (unknownClocks.length > 0 && !args.allowExplicitCorrectionOverride) {
			const message = `Clock progress must reference a grounded clock: ${unknownClocks.join(", ")}.`;
			conflicts.push(message);
			issues.push(
				...unknownClocks.map((clock) =>
					createValidationIssue({
						code: "unknown_clock",
						fieldName: "clockProgress",
						message: `Unknown clock proposal: ${clock}.`,
					}),
				),
			);
		} else {
			effectiveChanges.clockProgress = proposal.clockProgress;
		}
	}

	if (proposal.resourcesSpent) {
		effectiveChanges.resourcesSpent = proposal.resourcesSpent;
	}

	if (proposal.damageTaken) {
		effectiveChanges.damageTaken = proposal.damageTaken;
	}

	if (proposal.activeCorrections) {
		effectiveChanges.activeCorrections = proposal.activeCorrections;
	}

	const postProposalState = applyStateChanges({
		currentState: args.artifacts.currentState,
		changes: effectiveChanges,
		nowIso:
			args.artifacts.currentState.updatedAtISO ??
			args.artifacts.currentState.worldTime.currentDateTimeISO ??
			new Date().toISOString(),
		eventId: null,
		catalog: args.artifacts.entityCatalog,
		sourceType: "validated-event",
	});
	issues.push(
		...validateCurrentStateIntegrity({
			currentState: postProposalState,
			catalog: args.artifacts.entityCatalog,
			nowIso:
				args.artifacts.currentState.updatedAtISO ??
				args.artifacts.currentState.worldTime.currentDateTimeISO ??
				null,
		}),
	);
	for (const issue of issues) {
		if (
			!conflicts.includes(issue.message) &&
			issue.code !== "no_changes_proposed"
		) {
			conflicts.push(issue.message);
		}
	}

	if (
		conflicts.length === 0 &&
		!hasProposedChanges(effectiveChanges) &&
		hasProposedChanges(proposal)
	) {
		uncertainties.push(
			"Validated proposal does not change canon because it matches the current state.",
		);
	}

	return {
		validated: conflicts.length === 0 && hasProposedChanges(effectiveChanges),
		effectiveChanges,
		conflicts,
		conflictIds: [],
		uncertainties,
		issues,
		consultedArtifacts: args.artifacts.consultedArtifacts,
		precedence: args.artifacts.precedence,
	};
}

function detectExplicitCorrectionConflicts(args: {
	proposal: StateChangeEvent["changes"];
	explicitCorrections: StateChangeEvent["changes"];
	allowExplicitCorrectionOverride: boolean;
}): string[] {
	if (args.allowExplicitCorrectionOverride) {
		return [];
	}

	const conflicts: string[] = [];
	if (
		args.proposal.currentLocation &&
		args.explicitCorrections.currentLocation &&
		args.proposal.currentLocation !== args.explicitCorrections.currentLocation
	) {
		conflicts.push(
			`Current location conflicts with an explicit user correction: ${args.explicitCorrections.currentLocation}.`,
		);
	}

	for (const field of [
		"activeQuests",
		"relevantFactions",
		"recentEvents",
		"factsRevealed",
		"factionConsequences",
		"clockProgress",
		"resourcesSpent",
		"damageTaken",
	] as const) {
		const proposedValue = args.proposal[field];
		const correctedValue = args.explicitCorrections[field];
		if (
			Array.isArray(proposedValue) &&
			Array.isArray(correctedValue) &&
			!sameStringArray(proposedValue, correctedValue)
		) {
			conflicts.push(
				`${field} conflicts with an explicit user correction and cannot override it without another correction.`,
			);
		}
	}

	if (args.proposal.npcAttitudes && args.explicitCorrections.npcAttitudes) {
		for (const [name, attitude] of Object.entries(args.proposal.npcAttitudes)) {
			const correctedAttitude = args.explicitCorrections.npcAttitudes[name];
			if (correctedAttitude && correctedAttitude !== attitude) {
				conflicts.push(
					`NPC attitude for ${name} conflicts with an explicit user correction.`,
				);
			}
		}
	}

	return conflicts;
}

function deriveRuntimeGuidance(
	query: string,
	artifacts: RuntimeArtifacts,
): {
	relevantRules: RelevantRule[];
	gmGuidance: string[];
	readinessGuidance: string[];
} {
	const relevantRules = selectRelevantRules(query, artifacts);
	const gmGuidance =
		relevantRules.length > 0
			? relevantRules.map(
					(rule) =>
						`${rule.title}: ${rule.summary} (source: rules/normalized/${rule.filename})`,
				)
			: [
					"No closely matched normalized rule section was found for this intent. Stay conservative, cite the nearest source manually, and do not advance canon without a validated state change.",
				];

	return {
		relevantRules,
		gmGuidance,
		readinessGuidance: deriveReadinessGuidance(artifacts.readiness),
	};
}

function selectRelevantRules(
	query: string,
	artifacts: RuntimeArtifacts,
): RelevantRule[] {
	const primaryTokens = extractQueryTokens(query);
	const contextualTokens = extractQueryTokens(
		[
			artifacts.currentState.currentLocation ?? "",
			...artifacts.currentState.activeQuests,
			...artifacts.currentState.relevantFactions,
		].join(" "),
	).filter((token) => !primaryTokens.includes(token));
	if (primaryTokens.length === 0 && contextualTokens.length === 0) {
		return [];
	}

	const requestedTags = new Set<string>();
	for (const token of primaryTokens) {
		for (const tag of TERM_TO_TAGS.get(token) ?? []) {
			requestedTags.add(tag);
		}
	}

	return artifacts.rules.sections
		.map((section) => {
			const titleTokens = new Set(extractQueryTokens(section.title));
			const summaryTokens = new Set(extractQueryTokens(section.summary));
			const keywordTokens = new Set(section.keywords);
			const tagTokens = new Set(section.tags);
			const matchedTerms = new Set<string>();
			let directScore = 0;
			let contextualScore = 0;
			let tagScore = 0;

			for (const token of primaryTokens) {
				if (titleTokens.has(token)) {
					directScore += 5;
					matchedTerms.add(token);
				}
				if (keywordTokens.has(token)) {
					directScore += 4;
					matchedTerms.add(token);
				}
				if (summaryTokens.has(token)) {
					directScore += 2;
					matchedTerms.add(token);
				}
			}

			for (const token of contextualTokens) {
				if (titleTokens.has(token)) {
					contextualScore += 2;
					matchedTerms.add(token);
				}
				if (keywordTokens.has(token)) {
					contextualScore += 1;
					matchedTerms.add(token);
				}
				if (summaryTokens.has(token)) {
					contextualScore += 1;
					matchedTerms.add(token);
				}
			}

			for (const requestedTag of requestedTags) {
				if (tagTokens.has(requestedTag)) {
					tagScore += 4;
					matchedTerms.add(requestedTag);
				}
			}

			const score = directScore + contextualScore + tagScore;

			return {
				title: section.title,
				filename: section.filename,
				summary: section.summary,
				tags: section.tags,
				keywords: section.keywords,
				matchedTerms: [...matchedTerms],
				score,
				directScore,
				tagScore,
			} satisfies RankedRelevantRule;
		})
		.filter(
			(section) =>
				section.score > 0 &&
				(section.directScore > 0 || section.tagScore >= 12),
		)
		.sort((left, right) => {
			if (right.score !== left.score) {
				return right.score - left.score;
			}
			return left.title.localeCompare(right.title);
		})
		.filter((section, _index, all) => {
			const bestScore = all[0]?.score ?? 0;
			return bestScore > 0 && section.score >= Math.max(6, bestScore - 6);
		})
		.slice(0, 3)
		.map(
			({ directScore: _directScore, tagScore: _tagScore, ...section }) =>
				section,
		);
}

function deriveReadinessGuidance(readiness: ReadinessReport): string[] {
	if (readiness.status === "ready" && readiness.gaps.length === 0) {
		return [
			"Campaign prep is ready. Canon can advance once a grounded change is validated.",
		];
	}

	const guidance = readiness.gaps.map((gap) => `Resolve readiness gap: ${gap}`);
	if (readiness.status === "needs-user-input") {
		guidance.push(
			"Add or update campaign notes outside .bardo/, rerun bardo init, and only then commit canon-changing actions.",
		);
	}
	return guidance;
}

function buildSceneNarration(args: {
	playerIntent: string;
	artifacts: RuntimeArtifacts;
	guidance: ReturnType<typeof deriveRuntimeGuidance>;
}): string {
	const locationClause = args.artifacts.currentState.currentLocation
		? `from the current state at ${args.artifacts.currentState.currentLocation}`
		: "without a grounded current location yet";
	const leadRule = args.guidance.relevantRules[0];
	const ruleClause = leadRule
		? `Primary guidance comes from ${leadRule.title}.`
		: "No close normalized rule match was found, so keep the ruling conservative.";
	const readinessClause =
		args.artifacts.readiness.status === "ready"
			? "Campaign prep is ready for validated canon updates."
			: `Campaign prep is ${args.artifacts.readiness.status}, so unresolved gaps remain explicit.`;
	return `Bardo resolves the scene conservatively ${locationClause}. ${ruleClause} ${readinessClause}`;
}

function asOptionalString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function normalizeKey(value: string): string {
	return value.trim().toLowerCase();
}

function extractQueryTokens(value: string): string[] {
	return [
		...new Set(
			(value.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []).filter(
				(token) => !RUNTIME_STOP_WORDS.has(token),
			),
		),
	];
}

function extractProposedChanges(
	args: Record<string, unknown>,
): StateChangeEvent["changes"] {
	const proposedChanges =
		typeof args.proposedChanges === "object" && args.proposedChanges !== null
			? (args.proposedChanges as Record<string, unknown>)
			: {};
	return {
		currentLocation:
			asOptionalString(proposedChanges.currentLocation) ??
			asOptionalString(args.currentLocation),
		activeQuests:
			toOptionalStringArray(proposedChanges.activeQuests) ??
			toOptionalStringArray(args.activeQuests),
		relevantFactions:
			toOptionalStringArray(proposedChanges.relevantFactions) ??
			toOptionalStringArray(args.relevantFactions),
		recentEvents:
			toOptionalStringArray(proposedChanges.recentEvents) ??
			toOptionalStringArray(args.recentEvents),
		factsRevealed:
			toOptionalStringArray(proposedChanges.factsRevealed) ??
			toOptionalStringArray(args.factsRevealed),
		resourcesSpent:
			toOptionalStringArray(proposedChanges.resourcesSpent) ??
			toOptionalStringArray(args.resourcesSpent),
		damageTaken:
			toOptionalStringArray(proposedChanges.damageTaken) ??
			toOptionalStringArray(args.damageTaken),
		factionConsequences:
			toOptionalStringArray(proposedChanges.factionConsequences) ??
			toOptionalStringArray(args.factionConsequences),
		npcAttitudes:
			toOptionalStringRecord(proposedChanges.npcAttitudes) ??
			toOptionalStringRecord(args.npcAttitudes),
		clockProgress:
			toOptionalStringArray(proposedChanges.clockProgress) ??
			toOptionalStringArray(args.clockProgress),
		activeCorrections:
			toOptionalStringArray(proposedChanges.activeCorrections) ??
			toOptionalStringArray(args.activeCorrections),
	};
}

function parseStructuredCorrection(
	args: Record<string, unknown>,
): StructuredCorrection {
	const correctionType = asOptionalString(args.correctionType);
	if (
		correctionType !== "replace_fact" &&
		correctionType !== "downgrade_certainty" &&
		correctionType !== "undo_bad_inference" &&
		correctionType !== "merge_duplicate_entities" &&
		correctionType !== "split_mistaken_merge" &&
		correctionType !== "backdated_correction"
	) {
		return null;
	}
	const targetEntityKind = asOptionalString(args.targetEntityKind);
	return {
		correctionType,
		targetEntityKind:
			targetEntityKind === "characters"
				? "characters"
				: targetEntityKind === "locations"
					? "locations"
					: targetEntityKind === "quests"
						? "quests"
						: targetEntityKind === "factions"
							? "factions"
							: targetEntityKind === "recentEvents"
								? "recentEvents"
								: targetEntityKind === "facts"
									? "facts"
									: targetEntityKind === "clocks"
										? "clocks"
										: undefined,
		targetEntityName: asOptionalString(args.targetEntityName),
		mergeInto: asOptionalString(args.mergeInto),
		newEntityName: asOptionalString(args.newEntityName),
		newAliases: toOptionalStringArray(args.newAliases) ?? [],
		fieldName: asOptionalString(args.fieldName),
		confidence:
			args.confidence === "confirmed" ||
			args.confidence === "validated-derived" ||
			args.confidence === "probable" ||
			args.confidence === "unresolved"
				? args.confidence
				: undefined,
		supersedesEventId: asOptionalString(args.supersedesEventId),
		removeValues: toOptionalStringArray(args.removeValues) ?? [],
		resolvedConflictIds: toOptionalStringArray(args.resolvedConflictIds) ?? [],
	};
}

async function applyStructuredCorrection(args: {
	bardoRoot: string;
	artifacts: RuntimeArtifacts;
	correction: StructuredCorrection;
	nowIso: string;
}): Promise<{
	currentStateOverride?: RuntimeCurrentState;
	entityCatalogOverride?: EntityCatalog;
	additionalAffectedEntityIds: string[];
	resolvedConflictIds: string[];
	supersedesEventIds: string[];
	extraChanges: Partial<StateChangeEvent["changes"]>;
	issues: RuntimeValidationIssue[];
}> {
	if (!args.correction) {
		return {
			additionalAffectedEntityIds: [],
			resolvedConflictIds: [],
			supersedesEventIds: [],
			extraChanges: {},
			issues: [],
		};
	}

	const issues: RuntimeValidationIssue[] = [];
	let currentStateOverride = args.artifacts.currentState;
	let entityCatalogOverride = normalizeEntityCatalogAliases(
		args.artifacts.entityCatalog,
	);
	const additionalAffectedEntityIds: string[] = [];
	const extraChanges: Partial<StateChangeEvent["changes"]> = {};

	switch (args.correction.correctionType) {
		case "merge_duplicate_entities": {
			if (
				!args.correction.targetEntityKind ||
				!args.correction.targetEntityName ||
				!args.correction.mergeInto
			) {
				issues.push(
					createValidationIssue({
						code: "ambiguous_entity_alias",
						fieldName: "entityCatalog",
						message:
							"merge_duplicate_entities requires targetEntityKind, targetEntityName, and mergeInto.",
					}),
				);
				break;
			}
			entityCatalogOverride = mergeEntityRecords({
				catalog: entityCatalogOverride,
				kind: args.correction.targetEntityKind,
				primaryName: args.correction.mergeInto,
				duplicateName: args.correction.targetEntityName,
			});
			currentStateOverride = replaceEntityReferenceNames({
				currentState: currentStateOverride,
				fromName: args.correction.targetEntityName,
				toName: args.correction.mergeInto,
			});
			const primaryId =
				findEntityId(
					entityCatalogOverride,
					args.correction.targetEntityKind,
					args.correction.mergeInto,
				) ?? null;
			if (primaryId) {
				additionalAffectedEntityIds.push(primaryId);
			}
			break;
		}
		case "split_mistaken_merge": {
			if (
				!args.correction.targetEntityKind ||
				!args.correction.targetEntityName ||
				!args.correction.newEntityName
			) {
				issues.push(
					createValidationIssue({
						code: "ambiguous_entity_alias",
						fieldName: "entityCatalog",
						message:
							"split_mistaken_merge requires targetEntityKind, targetEntityName, and newEntityName.",
					}),
				);
				break;
			}
			entityCatalogOverride = splitEntityRecord({
				catalog: entityCatalogOverride,
				kind: args.correction.targetEntityKind,
				existingName: args.correction.targetEntityName,
				newName: args.correction.newEntityName,
				newAliases: args.correction.newAliases ?? [],
			});
			const newId =
				findEntityId(
					entityCatalogOverride,
					args.correction.targetEntityKind,
					args.correction.newEntityName,
				) ?? null;
			if (newId) {
				additionalAffectedEntityIds.push(newId);
			}
			break;
		}
		case "downgrade_certainty": {
			if (!args.correction.fieldName || !args.correction.confidence) {
				issues.push(
					createValidationIssue({
						code: "invalid_schema_version",
						fieldName: "fieldMetadata",
						message: "downgrade_certainty requires fieldName and confidence.",
					}),
				);
				break;
			}
			const entry =
				currentStateOverride.fieldMetadata[args.correction.fieldName];
			if (!entry) {
				issues.push(
					createValidationIssue({
						code: "invalid_schema_version",
						fieldName: args.correction.fieldName,
						message: `Cannot downgrade certainty for missing field ${args.correction.fieldName}.`,
					}),
				);
				break;
			}
			currentStateOverride = normalizeRuntimeCurrentState(
				{
					...currentStateOverride,
					fieldMetadata: {
						...currentStateOverride.fieldMetadata,
						[args.correction.fieldName]: {
							...entry,
							confidence: args.correction.confidence,
							provenance: {
								...entry.provenance,
								updatedAtISO: args.nowIso,
								actor: "user_correction",
							},
						},
					},
				},
				{
					catalog: entityCatalogOverride,
					nowIso: args.nowIso,
				},
			);
			break;
		}
		case "undo_bad_inference": {
			if (
				args.correction.fieldName === "factsRevealed" &&
				(args.correction.removeValues?.length ?? 0) > 0
			) {
				extraChanges.removeFactsRevealed = args.correction.removeValues;
			}
			if (
				args.correction.fieldName === "recentEvents" &&
				(args.correction.removeValues?.length ?? 0) > 0
			) {
				extraChanges.removeRecentEvents = args.correction.removeValues;
			}
			break;
		}
		case "replace_fact": {
			if ((args.correction.removeValues?.length ?? 0) > 0) {
				extraChanges.removeFactsRevealed = args.correction.removeValues;
			}
			break;
		}
		case "backdated_correction":
			break;
	}

	return {
		currentStateOverride,
		entityCatalogOverride,
		additionalAffectedEntityIds,
		resolvedConflictIds: args.correction.resolvedConflictIds ?? [],
		supersedesEventIds: args.correction.supersedesEventId
			? [args.correction.supersedesEventId]
			: [],
		extraChanges,
		issues,
	};
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((entry): entry is string => typeof entry === "string");
}

function toOptionalStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	return value
		.filter((entry): entry is string => typeof entry === "string")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

function toStringRecord(value: unknown): Record<string, string> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return {};
	}
	return Object.fromEntries(
		Object.entries(value)
			.filter(
				([key, entry]) =>
					typeof key === "string" &&
					key.trim().length > 0 &&
					typeof entry === "string" &&
					entry.trim().length > 0,
			)
			.map(([key, entry]) => [key.trim(), entry.trim()]),
	);
}

function flattenEntityCatalog(catalog: EntityCatalog): CampaignEntities {
	return {
		characters: catalog.characters.map((entry) => entry.name),
		locations: catalog.locations.map((entry) => entry.name),
		quests: catalog.quests.map((entry) => entry.name),
		factions: catalog.factions.map((entry) => entry.name),
		recentEvents: catalog.recentEvents.map((entry) => entry.name),
		facts: catalog.facts.map((entry) => entry.name),
		clocks: catalog.clocks.map((entry) => entry.name),
	};
}

function ensureCatalogCoverageForExplicitCorrection(args: {
	catalog: EntityCatalog;
	proposal: Partial<StateChangeEvent["changes"]>;
}): EntityCatalog {
	let catalog = normalizeEntityCatalogAliases(args.catalog);
	if (args.proposal.currentLocation) {
		catalog = upsertEntityRecord({
			catalog,
			kind: "locations",
			name: args.proposal.currentLocation,
			sourcePath: "user_correction",
		});
	}
	for (const quest of args.proposal.activeQuests ?? []) {
		catalog = upsertEntityRecord({
			catalog,
			kind: "quests",
			name: quest,
			sourcePath: "user_correction",
		});
	}
	for (const faction of args.proposal.relevantFactions ?? []) {
		catalog = upsertEntityRecord({
			catalog,
			kind: "factions",
			name: faction,
			sourcePath: "user_correction",
		});
	}
	for (const recentEvent of args.proposal.recentEvents ?? []) {
		catalog = upsertEntityRecord({
			catalog,
			kind: "recentEvents",
			name: recentEvent,
			sourcePath: "user_correction",
		});
	}
	for (const fact of args.proposal.factsRevealed ?? []) {
		catalog = upsertEntityRecord({
			catalog,
			kind: "facts",
			name: fact,
			sourcePath: "user_correction",
		});
	}
	for (const progress of args.proposal.clockProgress ?? []) {
		catalog = upsertEntityRecord({
			catalog,
			kind: "clocks",
			name: progress,
			sourcePath: "user_correction",
		});
	}
	for (const name of Object.keys(args.proposal.npcAttitudes ?? {})) {
		catalog = upsertEntityRecord({
			catalog,
			kind: "characters",
			name,
			sourcePath: "user_correction",
		});
	}
	return catalog;
}

function toOptionalStringRecord(
	value: unknown,
): Record<string, string> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}
	return toStringRecord(value);
}

function hasProposedChanges(changes: StateChangeEvent["changes"]): boolean {
	return Boolean(
		changes.currentLocation ||
			(changes.activeQuests && changes.activeQuests.length > 0) ||
			(changes.relevantFactions && changes.relevantFactions.length > 0) ||
			(changes.recentEvents && changes.recentEvents.length > 0) ||
			(changes.factsRevealed && changes.factsRevealed.length > 0) ||
			(changes.resourcesSpent && changes.resourcesSpent.length > 0) ||
			(changes.damageTaken && changes.damageTaken.length > 0) ||
			(changes.factionConsequences && changes.factionConsequences.length > 0) ||
			(changes.clockProgress && changes.clockProgress.length > 0) ||
			(changes.activeCorrections && changes.activeCorrections.length > 0) ||
			(changes.npcAttitudes && Object.keys(changes.npcAttitudes).length > 0),
	);
}

function sameStringArray(left: string[], right: string[]): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === (right[index] ?? ""))
	);
}

function sameStringRecord(
	left: Record<string, string>,
	right: Record<string, string>,
): boolean {
	const leftEntries = Object.entries(left).sort(([leftKey], [rightKey]) =>
		leftKey.localeCompare(rightKey),
	);
	const rightEntries = Object.entries(right).sort(([leftKey], [rightKey]) =>
		leftKey.localeCompare(rightKey),
	);
	return (
		leftEntries.length === rightEntries.length &&
		leftEntries.every(
			([key, value], index) =>
				key === (rightEntries[index]?.[0] ?? "") &&
				value === (rightEntries[index]?.[1] ?? ""),
		)
	);
}

async function loadExplicitCorrections(
	eventLogPath: string,
): Promise<StateChangeEvent["changes"]> {
	const raw = await readFile(eventLogPath, "utf8").catch((error: unknown) => {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return "";
		}
		throw error;
	});
	const overlay: StateChangeEvent["changes"] = {};
	for (const line of raw
		.split(/\r?\n/)
		.filter((entry) => entry.trim().length > 0)) {
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(line) as Record<string, unknown>;
		} catch (error) {
			throw new Error(
				`Runtime artifact corruption detected in ${eventLogPath}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
		if (
			parsed.validated !== true ||
			parsed.canonBasis !== "explicit-user-correction"
		) {
			continue;
		}
		const changes =
			typeof parsed.changes === "object" && parsed.changes !== null
				? normalizeRuntimeCurrentState(
						parsed.changes as Partial<RuntimeCurrentState>,
						{
							catalog: normalizeEntityCatalog({}),
							nowIso: typeof parsed.atISO === "string" ? parsed.atISO : null,
						},
					)
				: null;
		if (!changes) {
			continue;
		}
		if (changes.currentLocation) {
			overlay.currentLocation = changes.currentLocation;
		}
		for (const field of [
			"activeQuests",
			"relevantFactions",
			"recentEvents",
			"factsRevealed",
			"resourcesSpent",
			"damageTaken",
			"factionConsequences",
			"clockProgress",
			"activeCorrections",
		] as const) {
			if (changes[field].length > 0) {
				overlay[field] = changes[field];
			}
		}
		if (Object.keys(changes.npcAttitudes).length > 0) {
			overlay.npcAttitudes = {
				...(overlay.npcAttitudes ?? {}),
				...changes.npcAttitudes,
			};
		}
	}
	return overlay;
}

async function readEventLogRecords(
	eventLogPath: string,
): Promise<RuntimeEventRecord[]> {
	const raw = await readFile(eventLogPath, "utf8").catch((error: unknown) => {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return "";
		}
		throw error;
	});
	return raw
		.split(/\r?\n/)
		.filter((entry) => entry.trim().length > 0)
		.map((line) => {
			const parsed = JSON.parse(line) as RuntimeEventRecord;
			validateSchemaVersion(parsed.schemaVersion, { allowMissing: true });
			if (
				![
					"bootstrap",
					"player_action",
					"world_sync",
					"simulation_tick",
					"user_correction",
				].includes(parsed.eventType)
			) {
				throw new Error(
					`Runtime artifact corruption detected in ${eventLogPath}: invalid stored event type.`,
				);
			}
			return parsed;
		});
}

function deriveAffectedEntityIds(args: {
	catalog: EntityCatalog;
	changes: StateChangeEvent["changes"];
}): string[] {
	const affected: string[] = [];
	if (args.changes.currentLocation) {
		const entityId = findEntityId(
			args.catalog,
			"locations",
			args.changes.currentLocation,
		);
		if (entityId) {
			affected.push(entityId);
		}
	}
	for (const quest of args.changes.activeQuests ?? []) {
		const entityId = findEntityId(args.catalog, "quests", quest);
		if (entityId) {
			affected.push(entityId);
		}
	}
	for (const faction of args.changes.relevantFactions ?? []) {
		const entityId = findEntityId(args.catalog, "factions", faction);
		if (entityId) {
			affected.push(entityId);
		}
	}
	for (const name of Object.keys(args.changes.npcAttitudes ?? {})) {
		const entityId = findEntityId(args.catalog, "characters", name);
		if (entityId) {
			affected.push(entityId);
		}
	}
	for (const progress of args.changes.clockProgress ?? []) {
		const entityId =
			args.catalog.clocks.find((clock) =>
				progress.toLowerCase().includes(clock.name.toLowerCase()),
			)?.id ?? null;
		if (entityId) {
			affected.push(entityId);
		}
	}
	return unique(affected);
}

function createConflictRecordsFromMessages(args: {
	conflicts: string[];
	issues: RuntimeValidationIssue[];
	nowIso: string;
	proposal: StateChangeEvent["changes"];
}): ReturnType<typeof createConflictRecord>[] {
	const conflictRecords = args.conflicts.map((conflict) => {
		if (conflict.startsWith("Current location conflicts")) {
			const correctedValue = conflict
				.split(":")
				.slice(1)
				.join(":")
				.trim()
				.replace(/\.$/, "");
			return createConflictRecord({
				fieldName: "currentLocation",
				competingValues: [
					correctedValue,
					args.proposal.currentLocation ?? "unknown",
				],
				competingSources: ["explicit user correction", "validated proposal"],
				recordedAtISO: args.nowIso,
				precedenceResult: "blocked_by_higher_precedence",
			});
		}
		return createConflictRecord({
			fieldName: inferConflictFieldName(conflict),
			competingValues: [conflict],
			competingSources: ["runtime validation"],
			recordedAtISO: args.nowIso,
			precedenceResult: conflict
				.toLowerCase()
				.includes("explicit user correction")
				? "blocked_by_higher_precedence"
				: "invalid_state",
		});
	});
	const issueRecords = args.issues
		.filter((issue) => issue.conflictId === null)
		.map((issue) =>
			createConflictRecord({
				fieldName: issue.fieldName ?? "unknown",
				competingValues: [issue.message],
				competingSources: ["runtime validation"],
				recordedAtISO: args.nowIso,
				precedenceResult:
					issue.code === "explicit_correction_conflict"
						? "blocked_by_higher_precedence"
						: "invalid_state",
			}),
		);
	return [...conflictRecords, ...issueRecords].filter(
		(record, index, all) =>
			all.findIndex(
				(candidate) => candidate.conflictId === record.conflictId,
			) === index,
	);
}

function inferConflictFieldName(conflict: string): string {
	if (conflict.toLowerCase().includes("location")) {
		return "currentLocation";
	}
	if (conflict.toLowerCase().includes("quest")) {
		return "activeQuests";
	}
	if (conflict.toLowerCase().includes("faction")) {
		return "relevantFactions";
	}
	if (conflict.toLowerCase().includes("clock")) {
		return "clockProgress";
	}
	if (conflict.toLowerCase().includes("npc")) {
		return "npcAttitudes";
	}
	return "unknown";
}

async function persistConflictRecords(args: {
	bardoRoot: string;
	conflicts: ReturnType<typeof createConflictRecord>[];
	nowIso: string;
	resolvedConflictIds?: string[];
}): Promise<void> {
	const conflictsPath = path.join(
		args.bardoRoot,
		RUNTIME_ARTIFACT_PATHS.conflicts,
	);
	const manifest = normalizeConflictManifest(
		await readFile(conflictsPath, "utf8")
			.then((raw) => JSON.parse(raw) as Record<string, unknown>)
			.catch((error: unknown) => {
				if (
					typeof error === "object" &&
					error !== null &&
					"code" in error &&
					error.code === "ENOENT"
				) {
					return {};
				}
				throw error;
			}),
	);
	const merged = [
		...manifest.conflicts
			.filter(
				(existing) =>
					!args.conflicts.some(
						(incoming) => incoming.conflictId === existing.conflictId,
					),
			)
			.map((existing) =>
				(args.resolvedConflictIds ?? []).includes(existing.conflictId)
					? {
							...existing,
							resolutionStatus: "resolved" as const,
						}
					: existing,
			),
		...args.conflicts,
	];
	await mkdir(path.dirname(conflictsPath), { recursive: true });
	await writeFile(
		conflictsPath,
		JSON.stringify(
			{
				schemaVersion: RUNTIME_SCHEMA_VERSION,
				updatedAtISO: args.nowIso,
				conflicts: merged,
			},
			null,
			2,
		),
		"utf8",
	);
}

async function writeSupportArtifacts(args: {
	bardoRoot: string;
	nowIso: string;
	currentState: RuntimeCurrentState;
	latestEvent: RuntimeEventRecord | null;
	eventCount: number;
	readinessStatus: string | null;
}): Promise<void> {
	const conflictsPath = path.join(
		args.bardoRoot,
		RUNTIME_ARTIFACT_PATHS.conflicts,
	);
	const eventLogPath = path.join(args.bardoRoot, "events/state-changes.ndjson");
	const conflictsManifest = normalizeConflictManifest(
		await readFile(conflictsPath, "utf8")
			.then((raw) => JSON.parse(raw) as Record<string, unknown>)
			.catch((error: unknown) => {
				if (
					typeof error === "object" &&
					error !== null &&
					"code" in error &&
					error.code === "ENOENT"
				) {
					return {};
				}
				throw error;
			}),
	);
	const stateHash = computeStateHash(args.currentState);
	const snapshot = createSnapshotRecord({
		currentState: args.currentState,
		stateHash,
		createdAtISO: args.nowIso,
		eventId: args.latestEvent?.eventId ?? null,
		eventIndex: args.eventCount,
		reason:
			args.latestEvent?.canonBasis === "explicit-user-correction"
				? "correction"
				: args.latestEvent
					? "commit"
					: "bootstrap",
	});
	const snapshotFileName =
		args.latestEvent?.eventId !== null &&
		args.latestEvent?.eventId !== undefined
			? `${String(args.eventCount).padStart(6, "0")}-${args.latestEvent.eventId}.json`
			: "000000-bootstrap.json";
	const snapshotRelativePath = path
		.join(RUNTIME_ARTIFACT_PATHS.snapshotsDirectory, snapshotFileName)
		.replaceAll("\\", "/");
	const snapshotIndexPath = path.join(
		args.bardoRoot,
		RUNTIME_ARTIFACT_PATHS.snapshotIndex,
	);
	const snapshotIndex = normalizeSnapshotIndexManifest(
		await readFile(snapshotIndexPath, "utf8")
			.then((raw) => JSON.parse(raw) as Record<string, unknown>)
			.catch((error: unknown) => {
				if (
					typeof error === "object" &&
					error !== null &&
					"code" in error &&
					error.code === "ENOENT"
				) {
					return {};
				}
				throw error;
			}),
	);
	const nextSnapshotIndex = {
		schemaVersion: RUNTIME_SCHEMA_VERSION,
		updatedAtISO: args.nowIso,
		snapshots: [
			...snapshotIndex.snapshots.filter(
				(entry) => entry.snapshotId !== snapshot.snapshotId,
			),
			{
				snapshotId: snapshot.snapshotId,
				path: snapshotRelativePath,
				createdAtISO: snapshot.createdAtISO,
				stateHash: snapshot.stateHash,
				reason: snapshot.reason,
				replayPosition: snapshot.replayPosition,
			},
		],
	};
	const eventLogRaw = await readFile(eventLogPath, "utf8").catch(() => "");
	const snapshotPayload = JSON.stringify(snapshot, null, 2);
	const latestSnapshotPath = path.join(
		args.bardoRoot,
		RUNTIME_ARTIFACT_PATHS.latestSnapshot,
	);
	const diagnostics = createDiagnosticsManifest({
		updatedAtISO: args.nowIso,
		readinessStatus: args.readinessStatus,
		latestEventId: args.latestEvent?.eventId ?? null,
		latestStateHash: stateHash,
		latestSnapshotId: snapshot.snapshotId,
		latestSnapshotPath: snapshotRelativePath,
		snapshotCount: nextSnapshotIndex.snapshots.length,
		activeConflictIds: conflictsManifest.conflicts
			.filter((entry) => entry.resolutionStatus === "unresolved")
			.map((entry) => entry.conflictId),
		recentEventIds: args.latestEvent ? [args.latestEvent.eventId] : [],
		correctionEventIds:
			args.latestEvent?.canonBasis === "explicit-user-correction"
				? [args.latestEvent.eventId]
				: [],
		integrity: {
			status: "valid",
			currentStateHash: stateHash,
			eventLogHash: computeStateHash(eventLogRaw),
			latestSnapshotHash: computeStateHash(snapshotPayload),
		},
		replayStatus: {
			canReplayFromEventZero: true,
			canReplayFromLatestSnapshot: true,
			lastReplayMode: null,
		},
	});
	await mkdir(path.dirname(latestSnapshotPath), { recursive: true });
	await writeFile(latestSnapshotPath, snapshotPayload, "utf8");
	await writeFile(
		path.join(args.bardoRoot, snapshotRelativePath),
		snapshotPayload,
		"utf8",
	);
	await writeFile(
		snapshotIndexPath,
		JSON.stringify(nextSnapshotIndex, null, 2),
		"utf8",
	);
	await mkdir(path.dirname(conflictsPath), { recursive: true });
	await writeFile(
		path.join(args.bardoRoot, RUNTIME_ARTIFACT_PATHS.diagnostics),
		JSON.stringify(diagnostics, null, 2),
		"utf8",
	);
}

async function appendTurnTrace(args: {
	bardoRoot: string;
	record: RuntimeTurnTraceRecord;
}): Promise<void> {
	const tracePath = path.join(args.bardoRoot, RUNTIME_ARTIFACT_PATHS.turnTrace);
	const existing = await readFile(tracePath, "utf8").catch((error: unknown) => {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return "";
		}
		throw error;
	});
	await mkdir(path.dirname(tracePath), { recursive: true });
	await writeFile(
		tracePath,
		existing.length > 0
			? `${existing.trimEnd()}\n${JSON.stringify(args.record)}\n`
			: `${JSON.stringify(args.record)}\n`,
		"utf8",
	);
}

export async function replayCommittedState(args: {
	bardoRoot: string;
	mode?: "events-only" | "latest-snapshot";
	fromEventId?: string | null;
	dryRun?: boolean;
}): Promise<{
	currentState: RuntimeCurrentState;
	stateHash: string;
	lastEventId: string | null;
	replayedEventCount: number;
	startedFromSnapshot: boolean;
}> {
	const entitiesPath = path.join(
		args.bardoRoot,
		"entities/campaign-entities.json",
	);
	const eventLogPath = path.join(args.bardoRoot, "events/state-changes.ndjson");
	const snapshotIndexPath = path.join(
		args.bardoRoot,
		RUNTIME_ARTIFACT_PATHS.snapshotIndex,
	);
	const entityCatalog = normalizeEntityCatalog(
		await readJsonFile<Record<string, unknown>>(
			entitiesPath,
			"campaign entities",
		),
	);
	const events = await readEventLogRecords(eventLogPath);
	const snapshotIndex = normalizeSnapshotIndexManifest(
		await readFile(snapshotIndexPath, "utf8")
			.then((raw) => JSON.parse(raw) as Record<string, unknown>)
			.catch(() => ({})),
	);
	const targetEventIndex =
		args.fromEventId != null
			? events.findIndex((event) => event.eventId === args.fromEventId)
			: -1;
	const replayFromIndex = targetEventIndex >= 0 ? targetEventIndex : 0;
	const selectedSnapshot =
		args.mode === "latest-snapshot" || args.fromEventId
			? ([...snapshotIndex.snapshots]
					.sort(
						(left, right) =>
							right.replayPosition.eventIndex - left.replayPosition.eventIndex,
					)
					.find((entry) =>
						args.fromEventId
							? entry.replayPosition.eventIndex < replayFromIndex
							: true,
					) ?? null)
			: null;
	let currentState = createBlankReplayState(entityCatalog);
	let startIndex = 0;
	let startedFromSnapshot = false;
	if (selectedSnapshot) {
		currentState = await readFile(
			path.join(args.bardoRoot, selectedSnapshot.path),
			"utf8",
		)
			.then((raw) =>
				normalizeSnapshotRecord(
					JSON.parse(raw) as Partial<
						ReturnType<typeof normalizeSnapshotRecord>
					>,
				),
			)
			.then((snapshot) =>
				normalizeRuntimeCurrentState(snapshot.currentState, {
					catalog: entityCatalog,
					nowIso: snapshot.createdAtISO,
				}),
			)
			.catch(() => createBlankReplayState(entityCatalog));
		startIndex = selectedSnapshot.replayPosition.eventIndex;
		startedFromSnapshot = true;
	}

	let replayedEventCount = 0;
	for (const event of events.slice(startIndex)) {
		if (args.fromEventId && replayedEventCount === 0) {
			const firstIndex = events.findIndex(
				(candidate) => candidate.eventId === args.fromEventId,
			);
			if (firstIndex > startIndex) {
				for (const priorEvent of events.slice(startIndex, firstIndex)) {
					currentState = applyStateChanges({
						currentState,
						changes: priorEvent.changes as StateChangeEvent["changes"],
						nowIso: priorEvent.atISO,
						eventId: priorEvent.eventId,
						catalog: entityCatalog,
						sourceType:
							priorEvent.canonBasis === "explicit-user-correction"
								? "user-correction"
								: "validated-event",
						sourcePath: null,
						actor: priorEvent.actorSource,
						correctionEventId:
							priorEvent.canonBasis === "explicit-user-correction"
								? priorEvent.eventId
								: null,
					});
				}
				startIndex = firstIndex;
			}
		}
		if (
			event.eventType === "bootstrap" &&
			typeof event.changes === "object" &&
			event.changes !== null &&
			"bootstrapState" in event.changes &&
			typeof event.changes.bootstrapState === "object" &&
			event.changes.bootstrapState !== null
		) {
			currentState = normalizeRuntimeCurrentState(
				migrateCurrentStateArtifact({
					raw: event.changes.bootstrapState as Record<string, unknown>,
					catalog: entityCatalog,
					nowIso: event.atISO,
				}),
				{
					catalog: entityCatalog,
					nowIso: event.atISO,
				},
			);
			replayedEventCount += 1;
			continue;
		}
		currentState = applyStateChanges({
			currentState,
			changes: event.changes as StateChangeEvent["changes"],
			nowIso: event.atISO,
			eventId: event.eventId,
			catalog: entityCatalog,
			sourceType:
				event.canonBasis === "explicit-user-correction"
					? "user-correction"
					: "validated-event",
			sourcePath: null,
			actor: event.actorSource,
			correctionEventId:
				event.canonBasis === "explicit-user-correction" ? event.eventId : null,
		});
		replayedEventCount += 1;
	}

	if (!args.dryRun) {
		const diagnosticsPath = path.join(
			args.bardoRoot,
			RUNTIME_ARTIFACT_PATHS.diagnostics,
		);
		const diagnostics = normalizeDiagnosticsManifest(
			await readFile(diagnosticsPath, "utf8")
				.then((raw) => JSON.parse(raw) as Record<string, unknown>)
				.catch(() => ({})),
		);
		await writeFile(
			diagnosticsPath,
			JSON.stringify(
				{
					...diagnostics,
					replayStatus: {
						canReplayFromEventZero: true,
						canReplayFromLatestSnapshot: snapshotIndex.snapshots.length > 0,
						lastReplayMode: args.fromEventId
							? "from-event"
							: args.mode === "latest-snapshot"
								? "latest-snapshot"
								: "events-only",
					},
					updatedAtISO: diagnostics.updatedAtISO ?? new Date().toISOString(),
				},
				null,
				2,
			),
			"utf8",
		);
	}

	return {
		currentState,
		stateHash: computeStateHash(currentState),
		lastEventId: events[events.length - 1]?.eventId ?? null,
		replayedEventCount,
		startedFromSnapshot,
	};
}

export async function buildRuntimeDiagnosticsBundle(args: {
	bardoRoot: string;
	recentEventCount?: number;
}): Promise<RuntimeDiagnosticsBundle> {
	const diagnosticsPath = path.join(
		args.bardoRoot,
		RUNTIME_ARTIFACT_PATHS.diagnostics,
	);
	const conflictsPath = path.join(
		args.bardoRoot,
		RUNTIME_ARTIFACT_PATHS.conflicts,
	);
	const snapshotIndexPath = path.join(
		args.bardoRoot,
		RUNTIME_ARTIFACT_PATHS.snapshotIndex,
	);
	const entitiesPath = path.join(
		args.bardoRoot,
		"entities/campaign-entities.json",
	);
	const eventLogPath = path.join(args.bardoRoot, "events/state-changes.ndjson");
	const diagnostics = migrateDiagnosticsManifestArtifact(
		await readJsonFile<Record<string, unknown>>(diagnosticsPath, "diagnostics"),
	);
	const conflicts = migrateConflictManifestArtifact(
		await readJsonFile<Record<string, unknown>>(conflictsPath, "conflicts"),
	);
	const snapshotIndex = migrateSnapshotIndexArtifact(
		await readJsonFile<Record<string, unknown>>(
			snapshotIndexPath,
			"snapshot index",
		),
	);
	const entityCatalog = migrateEntityCatalogArtifact(
		await readJsonFile<Record<string, unknown>>(
			entitiesPath,
			"campaign entities",
		),
	);
	const recentEvents = (await readEventLogRecords(eventLogPath)).slice(
		-Math.max(1, args.recentEventCount ?? 10),
	);
	return {
		diagnostics,
		conflicts,
		snapshotIndex,
		recentEvents,
		duplicateCandidates: findPotentialDuplicateEntities(entityCatalog),
	};
}

export async function simulateRollback(args: {
	bardoRoot: string;
	toEventId?: string | null;
	toSnapshotId?: string | null;
}): Promise<{
	targetState: RuntimeCurrentState;
	targetStateHash: string;
	fromStateHash: string;
	rollbackSummary: Record<string, unknown>;
}> {
	const entitiesPath = path.join(
		args.bardoRoot,
		"entities/campaign-entities.json",
	);
	const currentStatePath = path.join(
		args.bardoRoot,
		"state/current-state.json",
	);
	const eventLogPath = path.join(args.bardoRoot, "events/state-changes.ndjson");
	const snapshotIndexPath = path.join(
		args.bardoRoot,
		RUNTIME_ARTIFACT_PATHS.snapshotIndex,
	);
	const entityCatalog = migrateEntityCatalogArtifact(
		await readJsonFile<Record<string, unknown>>(
			entitiesPath,
			"campaign entities",
		),
	);
	const currentState = migrateCurrentStateArtifact({
		raw: await readJsonFile<Record<string, unknown>>(
			currentStatePath,
			"current state",
		),
		catalog: entityCatalog,
		nowIso: null,
	});
	const currentStateHash = computeStateHash(currentState);
	const events = await readEventLogRecords(eventLogPath);
	const snapshotIndex = migrateSnapshotIndexArtifact(
		await readJsonFile<Record<string, unknown>>(
			snapshotIndexPath,
			"snapshot index",
		),
	);

	let targetState = createBlankReplayState(entityCatalog);
	let startIndex = 0;
	if (args.toSnapshotId) {
		const selectedSnapshot = snapshotIndex.snapshots.find(
			(entry) => entry.snapshotId === args.toSnapshotId,
		);
		if (selectedSnapshot) {
			targetState = migrateSnapshotArtifact(
				await readJsonFile<Record<string, unknown>>(
					path.join(args.bardoRoot, selectedSnapshot.path),
					"snapshot",
				),
			).currentState;
			startIndex = selectedSnapshot.replayPosition.eventIndex;
		}
	}

	for (const event of events.slice(startIndex)) {
		targetState = applyStateChanges({
			currentState: targetState,
			changes: event.changes as StateChangeEvent["changes"],
			nowIso: event.atISO,
			eventId: event.eventId,
			catalog: entityCatalog,
			sourceType:
				event.canonBasis === "explicit-user-correction"
					? "user-correction"
					: "validated-event",
			sourcePath: null,
			actor: event.actorSource,
			correctionEventId:
				event.canonBasis === "explicit-user-correction" ? event.eventId : null,
		});
		if (args.toEventId && event.eventId === args.toEventId) {
			break;
		}
	}

	return {
		targetState,
		targetStateHash: computeStateHash(targetState),
		fromStateHash: currentStateHash,
		rollbackSummary: buildBeforeAfterSummary({
			currentState,
			nextState: targetState,
		}),
	};
}

function createBlankReplayState(
	entityCatalog: EntityCatalog,
): RuntimeCurrentState {
	return normalizeRuntimeCurrentState(createBlankCurrentState(null), {
		catalog: entityCatalog,
		nowIso: null,
	});
}

function buildNextSteps(
	validation: Pick<ValidationResult, "conflicts" | "uncertainties">,
	fallback: string[],
): string[] {
	const steps = [
		...validation.conflicts.map((conflict) => `Resolve conflict: ${conflict}`),
		...validation.uncertainties.map(
			(uncertainty) => `Clarify uncertainty: ${uncertainty}`,
		),
		...fallback,
	];
	return unique(steps);
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values));
}
