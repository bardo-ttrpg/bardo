export type SceneState = {
	summary: string;
	activeSituation: string;
	exits: string[];
	sensoryCues: string[];
	unresolvedQuestions: string[];
};

export type PartyState = {
	currentLocation: string;
	statusSummary: string;
	knownResources: string[];
	activeConditions: string[];
};

export type NpcState = {
	id: string;
	displayName: string;
	aliases: string[];
	role: string | null;
	disposition: "friendly" | "neutral" | "wary" | "hostile";
	currentLocation: string;
	introduced: boolean;
	discovered: boolean;
};

export type LocationState = {
	name: string;
	visits: number;
	npcIds: string[];
	tags: string[];
	exits: string[];
	activeClues: string[];
	occupantIds: string[];
};

export type ThreadState = {
	id: string;
	title: string;
	status: "open" | "active" | "resolved";
	urgency: "low" | "medium" | "high";
	summary: string;
};

export type FactionState = {
	id: string;
	name: string;
	stance: "friendly" | "neutral" | "hostile";
	pressure: number;
	openConflict: boolean;
};

export type ClockState = {
	id: string;
	label: string;
	kind: "investigation" | "threat" | "faction" | "environment" | "travel";
	progress: number;
	max: number;
};

export type MechanicsContextState = {
	ruleset: string;
	difficultyHint: number | null;
	combatActive: boolean;
	initiativeOrder: string[];
	advantageHints: string[];
};

export type CampaignState = {
	worldTimeISO: string;
	currentLocation: string;
	counters: {
		unknownNpc: number;
		unknownLocation: number;
	};
	scene: SceneState;
	party: PartyState;
	npcs: Record<string, NpcState>;
	locations: Record<string, LocationState>;
	threads: Record<string, ThreadState>;
	factions: Record<string, FactionState>;
	clocks: Record<string, ClockState>;
	mechanicsContext: MechanicsContextState;
	lastAction: string;
};

export type OptionalSystems = {
	npcs: boolean;
	quests: boolean;
	items: boolean;
	worldGeneration: boolean;
};
