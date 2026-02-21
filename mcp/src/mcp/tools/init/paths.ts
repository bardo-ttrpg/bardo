import { resolvePathInsideRoot } from "../../../infra/filesystem/filesystem";

export type InitPaths = {
	settingsPath: string;
	legacySettingsPath: string;
	scenePath: string;
	mapPath: string;
	statePath: string;
	historyPath: string;
	agentsPath: string;
	bootstrapPath: string;
	identityPath: string;
	userPath: string;
	soulPath: string;
};

export function resolveInitPaths(bardoRoot: string): InitPaths {
	return {
		settingsPath: resolvePathInsideRoot(bardoRoot, "_settings/settings.md"),
		legacySettingsPath: resolvePathInsideRoot(bardoRoot, "state/settings.md"),
		scenePath: resolvePathInsideRoot(
			bardoRoot,
			"world/scenes/starting-scene.md",
		),
		mapPath: resolvePathInsideRoot(bardoRoot, "world/maps/primary-map.md"),
		statePath: resolvePathInsideRoot(bardoRoot, "state/current.md"),
		historyPath: resolvePathInsideRoot(bardoRoot, "state/history.md"),
		agentsPath: resolvePathInsideRoot(bardoRoot, "AGENTS.md"),
		bootstrapPath: resolvePathInsideRoot(bardoRoot, "BOOTSTRAP.md"),
		identityPath: resolvePathInsideRoot(bardoRoot, "IDENTITY.md"),
		userPath: resolvePathInsideRoot(bardoRoot, "USER.md"),
		soulPath: resolvePathInsideRoot(bardoRoot, "SOUL.md"),
	};
}
