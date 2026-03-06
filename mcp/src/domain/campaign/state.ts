import type { CampaignState } from "./types";

function newStateTemplate(): CampaignState {
	return {
		worldTimeISO: new Date().toISOString(),
		currentLocation: "starting-area",
		counters: {
			unknownNpc: 0,
			unknownLocation: 0,
		},
		scene: {
			summary: "The adventure is ready to begin.",
			activeSituation: "Choose an action to establish the scene.",
			exits: [],
			sensoryCues: [],
			unresolvedQuestions: [],
		},
		party: {
			currentLocation: "starting-area",
			statusSummary: "The party is ready to act.",
			knownResources: [],
			activeConditions: [],
		},
		npcs: {},
		locations: {},
		threads: {},
		factions: {},
		clocks: {},
		mechanicsContext: {
			ruleset: "d20_v1",
			difficultyHint: null,
			combatActive: false,
			initiativeOrder: [],
			advantageHints: [],
		},
		lastAction: "",
	};
}

export function safeParseState(rawBody: string): CampaignState {
	if (!rawBody.trim()) {
		return newStateTemplate();
	}

	try {
		const parsed = JSON.parse(rawBody) as Partial<CampaignState>;
		const base = newStateTemplate();
		return {
			worldTimeISO:
				typeof parsed.worldTimeISO === "string"
					? parsed.worldTimeISO
					: base.worldTimeISO,
			currentLocation:
				typeof parsed.currentLocation === "string"
					? parsed.currentLocation
					: base.currentLocation,
			counters: {
				unknownNpc:
					typeof parsed.counters?.unknownNpc === "number"
						? parsed.counters.unknownNpc
						: base.counters.unknownNpc,
				unknownLocation:
					typeof parsed.counters?.unknownLocation === "number"
						? parsed.counters.unknownLocation
						: base.counters.unknownLocation,
			},
			scene:
				typeof parsed.scene === "object" && parsed.scene !== null
					? {
							summary:
								typeof parsed.scene.summary === "string"
									? parsed.scene.summary
									: base.scene.summary,
							activeSituation:
								typeof parsed.scene.activeSituation === "string"
									? parsed.scene.activeSituation
									: base.scene.activeSituation,
							exits: Array.isArray(parsed.scene.exits)
								? parsed.scene.exits.filter(
										(entry): entry is string => typeof entry === "string",
									)
								: base.scene.exits,
							sensoryCues: Array.isArray(parsed.scene.sensoryCues)
								? parsed.scene.sensoryCues.filter(
										(entry): entry is string => typeof entry === "string",
									)
								: base.scene.sensoryCues,
							unresolvedQuestions: Array.isArray(
								parsed.scene.unresolvedQuestions,
							)
								? parsed.scene.unresolvedQuestions.filter(
										(entry): entry is string => typeof entry === "string",
									)
								: base.scene.unresolvedQuestions,
						}
					: base.scene,
			party:
				typeof parsed.party === "object" && parsed.party !== null
					? {
							currentLocation:
								typeof parsed.party.currentLocation === "string"
									? parsed.party.currentLocation
									: base.party.currentLocation,
							statusSummary:
								typeof parsed.party.statusSummary === "string"
									? parsed.party.statusSummary
									: base.party.statusSummary,
							knownResources: Array.isArray(parsed.party.knownResources)
								? parsed.party.knownResources.filter(
										(entry): entry is string => typeof entry === "string",
									)
								: base.party.knownResources,
							activeConditions: Array.isArray(parsed.party.activeConditions)
								? parsed.party.activeConditions.filter(
										(entry): entry is string => typeof entry === "string",
									)
								: base.party.activeConditions,
						}
					: base.party,
			npcs:
				typeof parsed.npcs === "object" && parsed.npcs !== null
					? (parsed.npcs as CampaignState["npcs"])
					: base.npcs,
			locations:
				typeof parsed.locations === "object" && parsed.locations !== null
					? (parsed.locations as CampaignState["locations"])
					: base.locations,
			threads:
				typeof parsed.threads === "object" && parsed.threads !== null
					? (parsed.threads as CampaignState["threads"])
					: base.threads,
			factions:
				typeof parsed.factions === "object" && parsed.factions !== null
					? (parsed.factions as CampaignState["factions"])
					: base.factions,
			clocks:
				typeof parsed.clocks === "object" && parsed.clocks !== null
					? (parsed.clocks as CampaignState["clocks"])
					: base.clocks,
			mechanicsContext:
				typeof parsed.mechanicsContext === "object" &&
				parsed.mechanicsContext !== null
					? {
							ruleset:
								typeof parsed.mechanicsContext.ruleset === "string"
									? parsed.mechanicsContext.ruleset
									: base.mechanicsContext.ruleset,
							difficultyHint:
								typeof parsed.mechanicsContext.difficultyHint === "number"
									? parsed.mechanicsContext.difficultyHint
									: base.mechanicsContext.difficultyHint,
							combatActive:
								typeof parsed.mechanicsContext.combatActive === "boolean"
									? parsed.mechanicsContext.combatActive
									: base.mechanicsContext.combatActive,
							initiativeOrder: Array.isArray(
								parsed.mechanicsContext.initiativeOrder,
							)
								? parsed.mechanicsContext.initiativeOrder.filter(
										(entry): entry is string => typeof entry === "string",
									)
								: base.mechanicsContext.initiativeOrder,
							advantageHints: Array.isArray(
								parsed.mechanicsContext.advantageHints,
							)
								? parsed.mechanicsContext.advantageHints.filter(
										(entry): entry is string => typeof entry === "string",
									)
								: base.mechanicsContext.advantageHints,
						}
					: base.mechanicsContext,
			lastAction:
				typeof parsed.lastAction === "string"
					? parsed.lastAction
					: base.lastAction,
		};
	} catch {
		return newStateTemplate();
	}
}
