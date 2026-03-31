import { slugify, toDisplayName } from "../campaign/naming";
import type {
	CampaignState,
	FactionState,
	ThreadState,
} from "../campaign/types";

export type DiscoveryKind =
	| "npc"
	| "location"
	| "faction"
	| "item"
	| "clue"
	| "thread";
export type DiscoveryMode =
	| "explicitly_named"
	| "implicitly_present"
	| "role_placeholder";
export type DiscoveryConfidence = "high" | "medium" | "low";

export type DiscoveryCandidate = {
	kind: DiscoveryKind;
	id: string;
	displayName: string;
	discoveryMode: DiscoveryMode;
	confidence: DiscoveryConfidence;
	summary: string;
	metadata?: Record<string, unknown>;
	persisted?: boolean;
};

type GmPacket = {
	sceneFrame: {
		locationId: string;
		locationName: string;
		summary: string;
		activeSituation: string;
		exits: string[];
		sensoryCues: string[];
		unresolvedQuestions: string[];
	};
	resolution: {
		intent: string;
		fiction: string;
		mechanicsSummary: string;
		outcome: "success" | "failure" | "mixed";
	};
	narrativeBeats: string[];
	npcReactions: Array<{
		npcId: string;
		displayName: string;
		reaction: string;
		disposition: string;
	}>;
	discoveries: DiscoveryCandidate[];
	consequences: {
		timeAdvancedMinutes: number;
		worldTimeAfterISO: string;
		locationAfter: string;
		clocksAdvanced: string[];
		threadsActivated: string[];
	};
	followUps: string[];
	safetyNotes: string[];
	renderingHints: {
		tone: string;
		pacing: string;
		revealLevel: string;
		rulesTransparency: string;
	};
};

export type StateDelta = {
	worldTimeBeforeISO: string;
	worldTimeAfterISO: string;
	locationBefore: string;
	locationAfter: string;
	timeAdvancedMinutes: number;
	createdNpcIds: string[];
	createdLocationIds: string[];
};

type VenueKind = "tavern" | "inn" | "shop" | "gate" | "temple" | "camp";

type PlaceholderNpc = {
	id: string;
	displayName: string;
	role: string;
	disposition: "friendly" | "neutral" | "wary" | "hostile";
};

type SemanticSceneResolution = {
	locationId: string;
	locationName: string;
	locationTag: string;
	locationKeywords: string[];
	placeholderNpcs: PlaceholderNpc[];
	discoveries: DiscoveryCandidate[];
};

const VENUE_PATTERNS: Array<{
	kind: VenueKind;
	keyword: RegExp;
	locationLabel: string;
	keywords: string[];
	role?: string;
}> = [
	{
		kind: "tavern",
		keyword: /\b(tavern|inn|alehouse|pub)\b/i,
		locationLabel: "Tavern",
		keywords: ["tavern", "inn", "alehouse", "pub"],
		role: "barkeep",
	},
	{
		kind: "shop",
		keyword: /\b(shop|store|merchant stall|market stall)\b/i,
		locationLabel: "Shop",
		keywords: ["shop", "store", "merchant stall", "market stall"],
		role: "merchant",
	},
	{
		kind: "gate",
		keyword: /\b(gate|gatehouse)\b/i,
		locationLabel: "Town Gate",
		keywords: ["gate", "gatehouse"],
		role: "guard",
	},
	{
		kind: "temple",
		keyword: /\b(temple|shrine|chapel)\b/i,
		locationLabel: "Temple",
		keywords: ["temple", "shrine", "chapel"],
		role: "priest",
	},
	{
		kind: "camp",
		keyword: /\b(camp|campfire)\b/i,
		locationLabel: "Camp",
		keywords: ["camp", "campfire"],
	},
];

export function resolveSceneAnchorSlug(currentLocation: string): string {
	for (const venue of VENUE_PATTERNS) {
		const rawPrefixes = [`loc_${venue.kind}_`, `loc-${venue.kind}-`];
		const rawPrefix = rawPrefixes.find((prefix) =>
			currentLocation.startsWith(prefix),
		);
		if (rawPrefix) {
			const rawAnchor = currentLocation.slice(rawPrefix.length).trim();
			if (rawAnchor.length > 0) {
				return slugify(rawAnchor, "starting-area");
			}
		}
	}

	let normalized = slugify(currentLocation, "starting-area");
	for (const venue of VENUE_PATTERNS) {
		const prefixes = [`loc_${venue.kind}_`, `loc-${venue.kind}-`];
		const matchedPrefix = prefixes.find((prefix) =>
			normalized.startsWith(prefix),
		);
		if (matchedPrefix) {
			normalized = normalized.slice(matchedPrefix.length) || "starting-area";
			break;
		}
	}
	return normalized.length > 0 ? normalized : "starting-area";
}

export function resolveSceneAnchorName(currentLocation: string): string {
	return toDisplayName(resolveSceneAnchorSlug(currentLocation));
}

function semanticLocationId(kind: VenueKind, currentLocation: string): string {
	return `loc_${kind}_${resolveSceneAnchorSlug(currentLocation)}`;
}

function semanticNpcId(role: string, locationId: string): string {
	return `npc_${slugify(role, "person")}_${resolveSceneAnchorSlug(locationId)}_01`;
}

function namedFromTranscript(transcript: string | undefined): string[] {
	if (!transcript?.trim()) {
		return [];
	}
	const names = new Set<string>();
	const locationTerms = new Set([
		"forest",
		"woods",
		"wood",
		"inn",
		"tavern",
		"pub",
		"market",
		"square",
		"village",
		"town",
		"city",
		"mountain",
		"mountains",
		"river",
		"lake",
		"road",
		"trail",
		"gate",
		"chapel",
		"temple",
	]);
	const patterns = [
		/\b(?:i am|i'm|my name is|name's)\s+([A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){0,2})\b/gi,
	];
	for (const pattern of patterns) {
		for (const match of transcript.matchAll(pattern)) {
			const raw = match[1]?.trim();
			const lastToken = raw?.split(" ").at(-1)?.toLowerCase() ?? "";
			if (raw && !locationTerms.has(lastToken)) {
				names.add(raw);
			}
		}
	}
	return [...names];
}

export function inferSemanticSceneFromAction(args: {
	action: string;
	currentLocation: string;
	transcript?: string;
}): SemanticSceneResolution | null {
	const matchedVenue = VENUE_PATTERNS.find((entry) =>
		entry.keyword.test(args.action),
	);
	if (!matchedVenue) {
		return null;
	}

	const locationId = semanticLocationId(
		matchedVenue.kind,
		args.currentLocation,
	);
	const locationName = `${matchedVenue.locationLabel} at ${resolveSceneAnchorName(args.currentLocation)}`;
	const discoveries: DiscoveryCandidate[] = [
		{
			kind: "location",
			id: locationId,
			displayName: locationName,
			discoveryMode: "implicitly_present",
			confidence: "high",
			summary: `A concrete sub-location becomes the focus of the scene: ${locationName}.`,
			metadata: {
				tag: matchedVenue.kind,
			},
		},
	];

	const placeholderNpcs: PlaceholderNpc[] = [];
	if (matchedVenue.role) {
		const transcriptNames = namedFromTranscript(args.transcript);
		const explicitName = transcriptNames[0] ?? null;
		const npcId = explicitName
			? slugify(explicitName, matchedVenue.role)
			: semanticNpcId(matchedVenue.role, locationId);
		const displayName =
			explicitName ?? `Unknown ${toDisplayName(matchedVenue.role)}`;
		placeholderNpcs.push({
			id: npcId,
			displayName,
			role: matchedVenue.role,
			disposition: explicitName ? "neutral" : "wary",
		});
		discoveries.push({
			kind: "npc",
			id: npcId,
			displayName,
			discoveryMode: explicitName ? "explicitly_named" : "role_placeholder",
			confidence: explicitName ? "high" : "medium",
			summary: explicitName
				? `${displayName} is identified as the ${matchedVenue.role}.`
				: `The scene implies a ${matchedVenue.role} whose identity is not yet known.`,
			metadata: {
				role: matchedVenue.role,
				locationId,
			},
		});
	}

	return {
		locationId,
		locationName,
		locationTag: matchedVenue.kind,
		locationKeywords: matchedVenue.keywords,
		placeholderNpcs,
		discoveries,
	};
}

export function mergeStructuredDiscoveries(
	base: DiscoveryCandidate[],
	extra: DiscoveryCandidate[],
): DiscoveryCandidate[] {
	const merged = new Map<string, DiscoveryCandidate>();
	for (const item of [...base, ...extra]) {
		const existing = merged.get(item.id);
		if (!existing) {
			merged.set(item.id, item);
			continue;
		}
		const confidenceRank: Record<DiscoveryConfidence, number> = {
			low: 0,
			medium: 1,
			high: 2,
		};
		merged.set(item.id, {
			...existing,
			...item,
			confidence:
				confidenceRank[item.confidence] >= confidenceRank[existing.confidence]
					? item.confidence
					: existing.confidence,
			metadata: {
				...(existing.metadata ?? {}),
				...(item.metadata ?? {}),
			},
			persisted: item.persisted ?? existing.persisted,
		});
	}
	return [...merged.values()];
}

export function syncStateForDiscoveries(args: {
	state: CampaignState;
	locationId: string;
	locationName: string;
	locationTag: string;
	placeholderNpcs: PlaceholderNpc[];
}): { createdLocationIds: string[]; createdNpcIds: string[] } {
	const createdLocationIds: string[] = [];
	const createdNpcIds: string[] = [];

	if (!args.state.locations[args.locationId]) {
		args.state.locations[args.locationId] = {
			name: args.locationName,
			visits: 0,
			npcIds: [],
			tags: [args.locationTag],
			exits: [],
			activeClues: [],
			occupantIds: [],
		};
		createdLocationIds.push(args.locationId);
	} else if (
		!args.state.locations[args.locationId]?.tags.includes(args.locationTag)
	) {
		args.state.locations[args.locationId]?.tags.push(args.locationTag);
	}

	for (const npc of args.placeholderNpcs) {
		if (!args.state.npcs[npc.id]) {
			args.state.npcs[npc.id] = {
				id: npc.id,
				displayName: npc.displayName,
				aliases: [],
				role: npc.role,
				disposition: npc.disposition,
				currentLocation: args.locationId,
				introduced: npc.displayName.startsWith("Unknown ") === false,
				discovered: npc.displayName.startsWith("Unknown ") === false,
			};
			createdNpcIds.push(npc.id);
		}
		const location = args.state.locations[args.locationId];
		if (location && !location.npcIds.includes(npc.id)) {
			location.npcIds.push(npc.id);
		}
		if (location && !location.occupantIds.includes(npc.id)) {
			location.occupantIds.push(npc.id);
		}
	}

	return {
		createdLocationIds,
		createdNpcIds,
	};
}

function mechanicsSummary(args: {
	required: boolean;
	resolved: boolean;
	outcome: "success" | "failure" | null;
	total: number | null;
	targetDifficulty: number | null;
}): string {
	if (!args.required) {
		return "No explicit mechanics roll was required for this turn.";
	}
	if (!args.resolved) {
		return "Mechanics were required but not fully resolved.";
	}
	if (
		args.total === null ||
		args.targetDifficulty === null ||
		args.outcome === null
	) {
		return "Mechanics resolved without a complete numeric trace.";
	}
	return `Mechanics resolved as ${args.outcome} (${args.total} vs DC ${args.targetDifficulty}).`;
}

export function buildGmPacket(args: {
	action: string;
	intent: string;
	locationBefore: string;
	locationAfter: string;
	locationAfterName: string;
	worldTimeAfterISO: string;
	timeAdvancedMinutes: number;
	mechanics: {
		required: boolean;
		resolved: boolean;
		outcome: "success" | "failure" | null;
		total: number | null;
		targetDifficulty: number | null;
	};
	discoveries: DiscoveryCandidate[];
	state: CampaignState;
}): GmPacket {
	const npcReactions = args.discoveries
		.filter((discovery) => discovery.kind === "npc")
		.map((discovery) => ({
			npcId: discovery.id,
			displayName: discovery.displayName,
			reaction:
				discovery.discoveryMode === "explicitly_named"
					? `${discovery.displayName} openly engages with the party.`
					: `${discovery.displayName} reacts cautiously as the party presses the scene.`,
			disposition: args.state.npcs[discovery.id]?.disposition ?? "neutral",
		}));
	const outcome =
		args.mechanics.required && args.mechanics.outcome
			? args.mechanics.outcome
			: "mixed";
	const fiction =
		outcome === "success"
			? "The action lands cleanly and opens the scene."
			: outcome === "failure"
				? "The attempt meets resistance and complicates the scene."
				: "The scene shifts through conversation and observation rather than a decisive roll.";
	const narrativeBeats = [
		`The focus settles on ${args.locationAfterName} as the party acts.`,
		npcReactions[0]
			? `${npcReactions[0].displayName} becomes the immediate point of contact in the scene.`
			: `The environment itself answers the party's move with new details and tension.`,
		fiction,
		`Time advances by ${String(args.timeAdvancedMinutes)} minute(s), pushing the world clock to ${args.worldTimeAfterISO}.`,
	].filter(
		(beat, index, all) => beat.trim().length > 0 && all.indexOf(beat) === index,
	);
	return {
		sceneFrame: {
			locationId: args.locationAfter,
			locationName: args.locationAfterName,
			summary:
				args.state.scene.summary ||
				`The party is focused on ${args.locationAfterName}.`,
			activeSituation:
				args.state.scene.activeSituation ||
				`Resolve the consequences of: ${args.action}`,
			exits: args.state.scene.exits,
			sensoryCues: args.state.scene.sensoryCues,
			unresolvedQuestions: args.state.scene.unresolvedQuestions,
		},
		resolution: {
			intent: args.intent,
			fiction,
			mechanicsSummary: mechanicsSummary(args.mechanics),
			outcome,
		},
		narrativeBeats: narrativeBeats.slice(0, 7),
		npcReactions,
		discoveries: args.discoveries,
		consequences: {
			timeAdvancedMinutes: args.timeAdvancedMinutes,
			worldTimeAfterISO: args.worldTimeAfterISO,
			locationAfter: args.locationAfter,
			clocksAdvanced: Object.values(args.state.clocks)
				.filter((clock) => clock.progress > 0)
				.map((clock) => clock.id),
			threadsActivated: Object.values(args.state.threads)
				.filter((thread) => thread.status !== "resolved")
				.map((thread) => thread.id),
		},
		followUps: [
			"Press the most reactive NPC for details.",
			"Follow the freshest clue before the scene cools.",
			"Escalate only after syncing any new proper names.",
		],
		safetyNotes: [],
		renderingHints: {
			tone: "grounded_fantasy",
			pacing: "scene-focused",
			revealLevel: "incremental",
			rulesTransparency:
				args.mechanics.required && args.mechanics.resolved
					? "state-the-roll-briefly"
					: "fiction-first",
		},
	};
}

export function upsertThread(state: CampaignState, thread: ThreadState): void {
	state.threads[thread.id] = thread;
}

export function upsertFaction(
	state: CampaignState,
	faction: FactionState,
): void {
	state.factions[faction.id] = faction;
}
