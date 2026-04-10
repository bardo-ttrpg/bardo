import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { bootstrapCampaignWorkspace } from "./campaign-bootstrap";

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

type CurrentStateModel = {
	currentLocation: string | null;
	activeQuests: string[];
	relevantFactions: string[];
	recentEvents: string[];
	uncertainties: string[];
	factsRevealed: string[];
	resourcesSpent: string[];
	damageTaken: string[];
	factionConsequences: string[];
	npcAttitudes: Record<string, string>;
	clockProgress: string[];
	activeCorrections: string[];
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
	currentState: CurrentStateModel;
	entities: CampaignEntities;
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
	uncertainties: string[];
	consultedArtifacts: string[];
	precedence: string[];
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

export function createRuntimeToolHandlers(): Record<string, RuntimeToolHandler> {
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
				if (artifacts.readiness.status === "needs-user-input") {
					return {
						success: true,
						action,
						committed: false,
						canonChanged: false,
						confidence: "blocked",
						conflicts: [],
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
						commitPolicy:
							"Resolve readiness gaps before attempting canon-changing actions.",
					};
				}
				const validation = validateStateProposal({
					proposal,
					artifacts,
				});
				if (!validation.validated) {
					return {
						success: true,
						action,
						committed: false,
						canonChanged: false,
						confidence: "blocked",
						conflicts: validation.conflicts,
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
					};
				}
				const nowIso = context.nowIso ?? new Date().toISOString();
				const event = {
					type: "player_action_resolved",
					summary: `Player action resolved: ${action}`,
					changes: validation.effectiveChanges,
				} satisfies StateChangeEvent;
				await commitStateChangingEvent({
					bardoRoot: context.bardoRoot,
					event,
					nowIso,
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
					uncertainties: validation.uncertainties,
					nextSteps: [
						"Continue play from the updated current state and keep future canon changes grounded in validated events.",
					],
					agentInstructions: buildAgentInstructions({
						mode: "committed",
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
				commitPolicy: "Narration is not canon by itself.",
			};
		},
		user_correction: async (args, context) => {
			const correction =
				asOptionalString(args.correction) ?? "Explicit user correction";
			const artifacts = await loadRuntimeArtifacts(context.bardoRoot);
			const proposal = extractProposedChanges(args);
			const hasStructuredCorrection = hasProposedChanges(proposal);
			const validation = hasStructuredCorrection
				? validateStateProposal({
						proposal,
						artifacts,
						allowExplicitCorrectionOverride: true,
					})
				: {
						validated: true,
						effectiveChanges: {},
						conflicts: [],
						uncertainties: [],
						consultedArtifacts: artifacts.consultedArtifacts,
						precedence: artifacts.precedence,
					};
			if (!validation.validated) {
				return {
					success: true,
					correction,
					committed: false,
					canonChanged: false,
					confidence: "blocked",
					readiness: artifacts.readiness,
					conflicts: validation.conflicts,
					uncertainties: validation.uncertainties,
					consultedArtifacts: validation.consultedArtifacts,
					canonPrecedence: validation.precedence,
					nextSteps: buildNextSteps(validation, [
						"Provide grounded corrected fields, or restate the correction clearly so Bardo can durably record it as higher-precedence canon.",
					]),
					agentInstructions: buildAgentInstructions({
						mode: "blocked",
					}),
				};
			}

			const nowIso = context.nowIso ?? new Date().toISOString();
			const event = {
				type: "user_correction_applied",
				summary: correction,
				changes: {
					...validation.effectiveChanges,
					activeCorrections: unique([
						...artifacts.currentState.activeCorrections,
						correction,
					]),
				},
			} satisfies StateChangeEvent;
			await commitStateChangingEvent({
				bardoRoot: context.bardoRoot,
				event,
				nowIso,
				validated: true,
				canonBasis: "explicit-user-correction",
				consultedArtifacts: validation.consultedArtifacts,
				precedence: validation.precedence,
				conflicts: validation.conflicts,
				uncertainties: validation.uncertainties,
			});
			return {
				success: true,
				correction,
				committed: true,
				canonChanged: true,
				confidence: "corrected",
				eventType: "user_correction",
				readiness: artifacts.readiness,
				conflicts: validation.conflicts,
				uncertainties: validation.uncertainties,
				consultedArtifacts: validation.consultedArtifacts,
				canonPrecedence: validation.precedence,
				nextSteps: [
					"Continue play from the corrected canon and treat older conflicting facts as superseded until the user changes them again.",
				],
				agentInstructions: buildAgentInstructions({
					mode: "committed",
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
				return {
					success: true,
					committed: false,
					canonChanged: false,
					confidence: "blocked",
					readiness: artifacts.readiness,
					conflicts: validation.conflicts,
					uncertainties: validation.uncertainties,
					consultedArtifacts: validation.consultedArtifacts,
					canonPrecedence: validation.precedence,
					nextSteps: buildNextSteps(validation, deriveReadinessGuidance(artifacts.readiness)),
					agentInstructions: buildAgentInstructions({
						mode: "blocked",
					}),
				};
			}

			const event = {
				type: "world_sync_applied",
				summary: "World sync applied.",
				changes: validation.effectiveChanges,
			} satisfies StateChangeEvent;
			await commitStateChangingEvent({
				bardoRoot: context.bardoRoot,
				event,
				nowIso,
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
				uncertainties: validation.uncertainties,
				nextSteps: [
					"Use scene_turn or player_action from the updated current state.",
				],
				agentInstructions: buildAgentInstructions({
					mode: "committed",
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
					return {
						success: true,
						tickLabel,
						committed: false,
						canonChanged: false,
						confidence: "blocked",
						readiness: artifacts.readiness,
						conflicts: validation.conflicts,
						uncertainties: validation.uncertainties,
						consultedArtifacts: validation.consultedArtifacts,
						canonPrecedence: validation.precedence,
						nextSteps: buildNextSteps(validation, deriveReadinessGuidance(artifacts.readiness)),
						agentInstructions: buildAgentInstructions({
							mode: "blocked",
						}),
					};
				}
				const nowIso = context.nowIso ?? new Date().toISOString();
				const event = {
					type: "simulation_tick_applied",
					summary: tickLabel,
					changes: validation.effectiveChanges,
				} satisfies StateChangeEvent;
				await commitStateChangingEvent({
					bardoRoot: context.bardoRoot,
					event,
					nowIso,
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
					uncertainties: validation.uncertainties,
					nextSteps: [
						"Inspect the updated current state before narrating the next turn.",
					],
					agentInstructions: buildAgentInstructions({
						mode: "committed",
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

export async function commitStateChangingEvent(args: {
	bardoRoot: string;
	event: StateChangeEvent;
	nowIso: string;
	validated?: boolean;
	consultedArtifacts?: string[];
	canonBasis?: string;
	precedence?: string[];
	conflicts?: string[];
	uncertainties?: string[];
}): Promise<void> {
	if (args.validated !== true) {
		throw new Error(
			"Only validated state-changing events can be committed to canon.",
		);
	}

	const statePath = path.join(args.bardoRoot, "state/current-state.json");
	const eventLogPath = path.join(args.bardoRoot, "events/state-changes.ndjson");
	const currentState = await loadCurrentState(args.bardoRoot);
	const nextState = {
		...currentState,
		currentLocation:
			args.event.changes.currentLocation !== undefined
				? args.event.changes.currentLocation
				: currentState.currentLocation,
		activeQuests:
			args.event.changes.activeQuests ?? currentState.activeQuests ?? [],
		relevantFactions:
			args.event.changes.relevantFactions ?? currentState.relevantFactions ?? [],
		recentEvents: unique([
			...(currentState.recentEvents ?? []),
			...(args.event.changes.recentEvents ?? []),
		]),
		factsRevealed: unique([
			...(currentState.factsRevealed ?? []),
			...(args.event.changes.factsRevealed ?? []),
		]),
		resourcesSpent: unique([
			...(currentState.resourcesSpent ?? []),
			...(args.event.changes.resourcesSpent ?? []),
		]),
		damageTaken: unique([
			...(currentState.damageTaken ?? []),
			...(args.event.changes.damageTaken ?? []),
		]),
		factionConsequences: unique([
			...(currentState.factionConsequences ?? []),
			...(args.event.changes.factionConsequences ?? []),
		]),
		npcAttitudes: {
			...(currentState.npcAttitudes ?? {}),
			...(args.event.changes.npcAttitudes ?? {}),
		},
		clockProgress: unique([
			...(currentState.clockProgress ?? []),
			...(args.event.changes.clockProgress ?? []),
		]),
		activeCorrections: unique([
			...(currentState.activeCorrections ?? []),
			...(args.event.changes.activeCorrections ?? []),
		]),
		uncertainties:
			args.event.changes.uncertainties ?? currentState.uncertainties ?? [],
		updatedAtISO: args.nowIso,
	};

	await mkdir(path.dirname(statePath), { recursive: true });
	await mkdir(path.dirname(eventLogPath), { recursive: true });
	await writeFile(statePath, JSON.stringify(nextState, null, 2), "utf8");
	const existingLog = await readFile(eventLogPath, "utf8").catch(() => "");
	const nextLine = JSON.stringify({
		type: args.event.type,
		eventType:
			args.canonBasis === "explicit-user-correction"
				? "user_correction"
				: args.event.type,
		summary: args.event.summary,
		changes: args.event.changes,
		atISO: args.nowIso,
		validated: true,
		canonBasis: args.canonBasis ?? "campaign-artifacts",
		consultedArtifacts: args.consultedArtifacts ?? [],
		precedence: args.precedence ?? [...CANON_PRECEDENCE],
		conflicts: args.conflicts ?? [],
		uncertainties: args.uncertainties ?? [],
	});
	await writeFile(
		eventLogPath,
		existingLog.length > 0 ? `${existingLog.trimEnd()}\n${nextLine}\n` : `${nextLine}\n`,
		"utf8",
	);
}

async function loadRuntimeArtifacts(
	bardoRoot: string,
	options: {
		requireReadyForMutation?: boolean;
	} = {},
): Promise<RuntimeArtifacts> {
	const rulesIndexPath = path.join(bardoRoot, "rules/normalized/index.json");
	const entitiesPath = path.join(bardoRoot, "entities/campaign-entities.json");
	const readinessPath = path.join(bardoRoot, "manifests/readiness.json");
	const currentStatePath = path.join(bardoRoot, "state/current-state.json");
	const eventLogPath = path.join(bardoRoot, "events/state-changes.ndjson");

	const rules = normalizeRuleIndex(
		await readJsonFile<Record<string, unknown>>(
		rulesIndexPath,
		"rules bootstrap index",
		),
		rulesIndexPath,
	);
	const entities = normalizeEntities(
		await readJsonFile<Partial<CampaignEntities>>(
			entitiesPath,
			"campaign entities",
		),
	);
	const readiness = normalizeReadiness(
		await readJsonFile<Partial<ReadinessReport>>(readinessPath, "readiness report"),
		readinessPath,
	);
	const currentState = normalizeCurrentState(
		await readJsonFile<Partial<CurrentStateModel>>(
			currentStatePath,
			"current state",
		),
	);
	const explicitCorrections = await loadExplicitCorrections(eventLogPath);

	if (options.requireReadyForMutation && readiness.status === "needs-user-input") {
		throw new Error(
			"Campaign readiness is needs-user-input. Finish bootstrap gaps before committing canon.",
		);
	}

	return {
		currentState,
		entities,
		readiness,
		rules,
		consultedArtifacts: [
			"rules/normalized/index.json",
			"entities/campaign-entities.json",
			"manifests/readiness.json",
			"state/current-state.json",
			"events/state-changes.ndjson",
		],
		precedence: [...CANON_PRECEDENCE],
		explicitCorrections,
	};
}

async function loadCurrentState(bardoRoot: string): Promise<CurrentStateModel> {
	const currentStatePath = path.join(bardoRoot, "state/current-state.json");
	return normalizeCurrentState(
		await readJsonFile<Partial<CurrentStateModel>>(
			currentStatePath,
			"current state",
		),
	);
}

async function readJsonFile<T>(
	filePath: string,
	label: string,
): Promise<T> {
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

function normalizeEntities(raw: Partial<CampaignEntities>): CampaignEntities {
	return {
		characters: toStringArray(raw.characters),
		locations: toStringArray(raw.locations),
		quests: toStringArray(raw.quests),
		factions: toStringArray(raw.factions),
		recentEvents: toStringArray(raw.recentEvents),
		facts: toStringArray(raw.facts),
		clocks: toStringArray(raw.clocks),
	};
}

function normalizeReadiness(
	raw: Partial<ReadinessReport>,
	filePath: string,
): ReadinessReport {
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

function normalizeCurrentState(
	raw: Partial<CurrentStateModel>,
): CurrentStateModel {
	return {
		currentLocation:
			typeof raw.currentLocation === "string" || raw.currentLocation === null
				? raw.currentLocation ?? null
				: null,
		activeQuests: toStringArray(raw.activeQuests),
		relevantFactions: toStringArray(raw.relevantFactions),
		recentEvents: toStringArray(raw.recentEvents),
		uncertainties: toStringArray(raw.uncertainties),
		factsRevealed: toStringArray(raw.factsRevealed),
		resourcesSpent: toStringArray(raw.resourcesSpent),
		damageTaken: toStringArray(raw.damageTaken),
		factionConsequences: toStringArray(raw.factionConsequences),
		npcAttitudes: toStringRecord(raw.npcAttitudes),
		clockProgress: toStringArray(raw.clockProgress),
		activeCorrections: toStringArray(raw.activeCorrections),
	};
}

function normalizeRuleIndex(
	raw: Record<string, unknown>,
	filePath: string,
): RuleIndex {
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
	const proposal = args.proposal;
	if (!hasProposedChanges(proposal)) {
		uncertainties.push(
			"No grounded state change was proposed for validation.",
		);
	}

	conflicts.push(
		...detectExplicitCorrectionConflicts({
			proposal,
			explicitCorrections: args.artifacts.explicitCorrections,
			allowExplicitCorrectionOverride: args.allowExplicitCorrectionOverride ?? false,
		}),
	);

	if (proposal.currentLocation) {
		const knownLocations = new Set(
			args.artifacts.entities.locations.map((value) => normalizeKey(value)),
		);
		if (
			!knownLocations.has(normalizeKey(proposal.currentLocation)) &&
			!args.allowExplicitCorrectionOverride
		) {
			conflicts.push(
				`Current location "${proposal.currentLocation}" is not present in campaign artifacts.`,
			);
			uncertainties.push(
				`Refusing to commit "${proposal.currentLocation}" because it is not grounded in the campaign prep artifacts.`,
			);
		} else if (proposal.currentLocation !== args.artifacts.currentState.currentLocation) {
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
			conflicts.push(
				`Active quest proposals are not grounded in campaign artifacts: ${unknownQuests.join(", ")}.`,
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
			conflicts.push(
				`Faction proposals are not grounded in campaign artifacts: ${unknownFactions.join(", ")}.`,
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
			conflicts.push(
				`Recent event proposals are not grounded in campaign artifacts: ${unknownEvents.join(", ")}.`,
			);
		} else if (
			!sameStringArray(proposal.recentEvents, args.artifacts.currentState.recentEvents)
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
			conflicts.push(
				`Revealed facts are not grounded in campaign artifacts: ${unknownFacts.join(", ")}.`,
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
		if (unknownConsequences.length > 0 && !args.allowExplicitCorrectionOverride) {
			conflicts.push(
				`Faction consequences must name a grounded faction: ${unknownConsequences.join(", ")}.`,
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
			conflicts.push(
				`NPC attitude updates require grounded characters: ${unknownCharacters.join(", ")}.`,
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
			conflicts.push(
				`Clock progress must reference a grounded clock: ${unknownClocks.join(", ")}.`,
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
		validated:
			conflicts.length === 0 && hasProposedChanges(effectiveChanges),
		effectiveChanges,
		conflicts,
		uncertainties,
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
	const contextualTokens = extractQueryTokens([
		artifacts.currentState.currentLocation ?? "",
		...artifacts.currentState.activeQuests,
		...artifacts.currentState.relevantFactions,
	].join(" ")).filter((token) => !primaryTokens.includes(token));
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
		.map(({ directScore: _directScore, tagScore: _tagScore, ...section }) => section);
}

function deriveReadinessGuidance(readiness: ReadinessReport): string[] {
	if (readiness.status === "ready" && readiness.gaps.length === 0) {
		return ["Campaign prep is ready. Canon can advance once a grounded change is validated."];
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
	for (const line of raw.split(/\r?\n/).filter((entry) => entry.trim().length > 0)) {
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
		if (parsed.validated !== true || parsed.canonBasis !== "explicit-user-correction") {
			continue;
		}
		const changes =
			typeof parsed.changes === "object" && parsed.changes !== null
				? normalizeCurrentState(parsed.changes as Partial<CurrentStateModel>)
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
