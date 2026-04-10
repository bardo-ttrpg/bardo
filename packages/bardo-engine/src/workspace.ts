import path from "node:path";
import { mkdir, rename, stat } from "node:fs/promises";

export const BARDO_ROOT_DIRNAME = ".bardo";
export const MIGRATED_ROOT_DIRNAME = "bardo";

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
	"rules/normalized",
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

export function resolveBardoRoot(
	workspaceRoot: string,
	_env: Record<string, string | undefined> = process.env,
): string {
	return path.join(workspaceRoot, BARDO_ROOT_DIRNAME);
}

export function resolveLegacyBardoRoot(workspaceRoot: string): string {
	return path.join(workspaceRoot, MIGRATED_ROOT_DIRNAME);
}

async function pathExists(targetPath: string): Promise<boolean> {
	return await stat(targetPath)
		.then(() => true)
		.catch((error: unknown) => {
			if (
				typeof error === "object" &&
				error !== null &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return false;
			}
			throw error;
		});
}

export async function migrateLegacyWorkspaceRoot(
	workspaceRoot: string,
): Promise<{
	migrated: boolean;
	bardoRoot: string;
	legacyRoot: string;
}> {
	const bardoRoot = resolveBardoRoot(workspaceRoot);
	const legacyRoot = resolveLegacyBardoRoot(workspaceRoot);
	const hasCanonicalRoot = await pathExists(bardoRoot);
	if (hasCanonicalRoot) {
		return {
			migrated: false,
			bardoRoot,
			legacyRoot,
		};
	}

	const hasLegacyRoot = await pathExists(legacyRoot);
	if (!hasLegacyRoot) {
		await mkdir(bardoRoot, { recursive: true });
		return {
			migrated: false,
			bardoRoot,
			legacyRoot,
		};
	}

	await mkdir(path.dirname(bardoRoot), { recursive: true });
	await rename(legacyRoot, bardoRoot);
	return {
		migrated: true,
		bardoRoot,
		legacyRoot,
	};
}
