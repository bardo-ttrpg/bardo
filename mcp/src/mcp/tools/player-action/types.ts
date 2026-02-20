import type { OptionalSystems } from "../../../domain/campaign/types";

export type Intent =
	| "travel"
	| "explore"
	| "social"
	| "rest"
	| "combat"
	| "general";

export type KnownLocation = {
	slug: string;
	name: string;
};

export type PlayerActionPaths = {
	statePath: string;
	historyPath: string;
	entitiesDir: string;
	locationsDir: string;
	stateDir: string;
};

export type ActionArtifacts = {
	createdNpcIds: string[];
	createdLocationIds: string[];
};

export type PlayerActionContext = {
	rootPath: string;
	statePath: string;
	historyPath: string;
	optionalSystems: OptionalSystems;
};
