export type DiceRoller = "player" | "bardo";

export type OptionalSystems = {
	npcs: boolean;
	quests: boolean;
	items: boolean;
	worldGeneration: boolean;
};

export type ThemeCategory =
	| "fantasy"
	| "sci-fi"
	| "post-apocalyptic"
	| "horror"
	| "modern"
	| "other";

export type WorkspaceHint = {
	firstLocationName: string | null;
	firstLocationSlug: string | null;
	firstQuestTitle: string | null;
	firstPartyTitle: string | null;
};

export type WorkspaceSummary = {
	markdownFiles: number;
	informativeFiles: number;
	totalContentChars: number;
	informativeByDirectory: Record<string, number>;
	looksSufficientForAutoScene: boolean;
	worldLocationFiles: number;
	worldInformativeFiles: number;
	workspaceEmpty: boolean;
};

export type ProceduralMapResult = {
	sceneText: string;
	startingLocationName: string;
	startingLocationSlug: string;
	mapData: Record<string, unknown>;
};

export type LocationCandidate = {
	slug: string;
	name: string;
};

export type SpawnOrigin = "workspace" | "map" | "wilderness" | "existing_state";

export type SpawnSelection = {
	slug: string;
	name: string;
	origin: SpawnOrigin;
};

export const defaultOptionalSystems: OptionalSystems = {
	npcs: true,
	quests: true,
	items: true,
	worldGeneration: true,
};
