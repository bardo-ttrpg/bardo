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
