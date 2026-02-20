import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveBardoRoot } from "../../../infra/filesystem/filesystem";
import type { AuthContext } from "../../../types/contracts";
import { makeToolResult } from "../../tool-result";
import {
	analyzeWorkspace,
	buildInitFailureOutput,
	ensureInitDirectories,
	ensureLocationMarkdownFile,
	type InitOutput,
	initInputSchema,
	initOutputSchema,
	mergeOptionalSystems,
	normalizeSavedDiceRoller,
	normalizeSavedOptionalSystems,
	normalizeTheme,
	persistInitSettings,
	persistStateAndHistory,
	readJsonMarkdown,
	resolveInitPaths,
	resolveStartingScene,
} from "./shared";

export function registerInitTool(server: McpServer, auth: AuthContext): void {
	server.registerTool(
		"init",
		{
			title: "Initialize Campaign Setup",
			description:
				"Initialize workspace, save player preferences (dice roller, theme, optional non-core systems), and set a starting scene. Scene strategy: use user-provided scene first; otherwise use existing world content; otherwise generate a theme-aware map and opening scene. For every new setup scene, pick a random spawn point (map/location or wilderness) and persist it to campaign state. If required context is missing, returns `requiresUserInput=true` with exact prompts.",
			inputSchema: initInputSchema,
			outputSchema: initOutputSchema,
			annotations: {
				title: "Initialize Campaign Setup",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async ({ diceRoller, theme, optionalSystems, startingScene }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const paths = resolveInitPaths(bardoRoot);
			const nextPrompts: string[] = [];

			const directorySetup = await ensureInitDirectories(bardoRoot);
			if (directorySetup.failureMessage) {
				const output = buildInitFailureOutput({
					message: directorySetup.failureMessage,
					nextPrompts,
					rootPath: bardoRoot,
					rootExistedBefore: directorySetup.rootExistedBefore,
					createdDirectories: directorySetup.createdDirectories,
					existingDirectories: directorySetup.existingDirectories,
					directories: directorySetup.directories,
					paths,
				});
				return makeToolResult(output, true);
			}

			const { summary, hint } = await analyzeWorkspace(bardoRoot);
			const settings = await readJsonMarkdown(paths.settingsPath);
			const legacySettings = await readJsonMarkdown(paths.legacySettingsPath);
			const legacySettingsDetected =
				Object.keys(legacySettings.data).length > 0;
			const sourceSettingsData =
				Object.keys(settings.data).length > 0
					? settings.data
					: legacySettings.data;

			const savedDiceRoller = normalizeSavedDiceRoller(
				sourceSettingsData.diceRoller,
			);
			const savedTheme =
				typeof sourceSettingsData.theme === "string"
					? normalizeTheme(sourceSettingsData.theme)
					: null;
			const savedOptionalSystems = normalizeSavedOptionalSystems(
				sourceSettingsData.optionalSystems,
			);

			const resolvedDiceRoller = diceRoller ?? savedDiceRoller;
			const resolvedTheme = normalizeTheme(theme) ?? savedTheme;
			const resolvedOptionalSystems = mergeOptionalSystems(
				savedOptionalSystems,
				optionalSystems,
			);

			if (!resolvedDiceRoller) {
				nextPrompts.push(
					"Who should roll party character dice for this campaign: `player` or `bardo`?",
				);
			}

			const scene = await resolveStartingScene({
				bardoRoot,
				paths,
				summary,
				hint,
				resolvedTheme,
				startingSceneInput: startingScene,
				nextPrompts,
			});

			const nowIso = new Date().toISOString();
			await persistInitSettings({
				settingsPath: paths.settingsPath,
				nowIso,
				resolvedDiceRoller,
				resolvedTheme,
				resolvedOptionalSystems,
				spawnSelection: scene.spawnSelection,
			});

			if (scene.startingSceneContent) {
				await ensureLocationMarkdownFile(
					bardoRoot,
					scene.startingLocationSlug,
					scene.startingLocationName,
				);

				await persistStateAndHistory({
					statePath: paths.statePath,
					historyPath: paths.historyPath,
					nowIso,
					startingLocationSlug: scene.startingLocationSlug,
					startingLocationName: scene.startingLocationName,
					resolvedDiceRoller,
					resolvedTheme,
					startingSceneSource: scene.startingSceneSource,
				});
			}

			const setupComplete =
				Boolean(resolvedDiceRoller) &&
				Boolean(scene.startingSceneContent.trim());
			const requiresUserInput = nextPrompts.length > 0;
			const message = setupComplete
				? "Initialization complete. Workspace, preferences, theme, and starting scene are ready."
				: "Initialization partially complete. Additional user input is required before campaign start.";

			const output: InitOutput = {
				success: true,
				setupComplete,
				requiresUserInput,
				message,
				nextPrompts,
				rootPath: bardoRoot,
				rootExistedBefore: directorySetup.rootExistedBefore,
				createdDirectories: directorySetup.createdDirectories,
				existingDirectories: directorySetup.existingDirectories,
				directories: directorySetup.directories,
				diceRoller: resolvedDiceRoller,
				theme: resolvedTheme,
				optionalSystems: resolvedOptionalSystems,
				settingsPath: paths.settingsPath,
				legacySettingsPath: paths.legacySettingsPath,
				legacySettingsDetected,
				startingScenePath: paths.scenePath,
				mapPath: paths.mapPath,
				mapGenerated: scene.mapGenerated,
				startingSceneSource: scene.startingSceneSource,
				startingScenePreview: scene.startingSceneContent.slice(0, 240),
				spawnLocationSlug: scene.spawnSelection?.slug,
				spawnLocationName: scene.spawnSelection?.name,
				spawnOrigin: scene.spawnSelection?.origin,
				workspaceSummary: summary,
				statePath: paths.statePath,
				historyPath: paths.historyPath,
			};

			return makeToolResult(output);
		},
	);
}
