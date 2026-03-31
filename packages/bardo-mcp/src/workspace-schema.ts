import path from "node:path";

const BARDO_ROOT_DIRNAME = "bardo";

const CANONICAL_DIRECTORIES = [
	"_settings",
	"context",
	"docs",
	"rules",
	"party",
	"entities",
	"items",
	"world",
	"quests",
	"events",
	"projections",
	"simulation",
	"state",
	"logs",
	"secrets",
	"manifests",
] as const;

const NESTED_DIRECTORIES = [
	"docs/clients",
	"rules/sources/system",
	"rules/sources/rulebook",
	"rules/sources/character-sheets",
	"rules/sources/bestiary",
	"rules/sources/expansions",
	"rules/sources/homebrew",
	"world/locations",
	"world/factions",
	"party/characters",
	"logs/sessions",
] as const;

export const WORKSPACE_DIRECTORIES = [
	...CANONICAL_DIRECTORIES,
	...NESTED_DIRECTORIES,
] as const;

function useFlatWorkspaceLayout(
	env: Record<string, string | undefined> = process.env,
): boolean {
	return env.BARDO_WORKSPACE_LAYOUT?.trim().toLowerCase() === "flat";
}

export function resolveBardoRoot(
	workspaceRoot: string,
	env: Record<string, string | undefined> = process.env,
): string {
	if (useFlatWorkspaceLayout(env)) {
		return workspaceRoot;
	}
	return path.join(workspaceRoot, BARDO_ROOT_DIRNAME);
}
