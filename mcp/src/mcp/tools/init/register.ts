import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveBardoRoot } from "../../../infra/filesystem/filesystem";
import { recordSetupLegacyFieldEmitMetric } from "../../../telemetry";
import type { AuthContext } from "../../../types/contracts";
import { makeToolResult } from "../../tool-result";
import { DICE_ROLLER_SETUP_QUESTION } from "./setup-prompts";
import {
	analyzeWorkspace,
	buildInitFailureOutput,
	ensureContextRepositoryScaffold,
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
	runBootstrapStep,
	runGuidedSetupFlow,
} from "./shared";

const INIT_DEPRECATION_NOTICE =
	"`init` remains available but the recommended primary entrypoint is `player_action`, which now auto-guides setup.";

function recordLegacySetupPromptFields(output: InitOutput): void {
	if (output.setupQuestion && output.setupQuestion.trim().length > 0) {
		recordSetupLegacyFieldEmitMetric({
			source: "init",
			field: "setupQuestion",
		});
	}
	if (Array.isArray(output.nextPrompts) && output.nextPrompts.length > 0) {
		recordSetupLegacyFieldEmitMetric({
			source: "init",
			field: "nextPrompts",
		});
	}
}

export function registerInitTool(server: McpServer, auth: AuthContext): void {
	server.registerTool(
		"init",
		{
			title: "Initialize Campaign Setup",
			description:
				"OpenClaw-style one-time bootstrap plus campaign setup. Bootstrap creates/maintains AGENTS.md, BOOTSTRAP.md, IDENTITY.md, USER.md (and SOUL.md when present), asks one question at a time, and removes BOOTSTRAP.md once complete. After bootstrap, init saves gameplay preferences (dice roller, theme, optional non-core systems), resolves starting scene, and persists campaign state/history.",
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
		async ({
			bootstrapOnly,
			bootstrapAnswers,
			setupAnswers,
			setupRevision,
			diceRoller,
			theme,
			optionalSystems,
			startingScene,
		}) => {
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

			await ensureContextRepositoryScaffold(bardoRoot);

			const nowIso = new Date().toISOString();
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

			let resolvedDiceRoller = diceRoller ?? savedDiceRoller;
			let resolvedTheme = normalizeTheme(theme) ?? savedTheme;
			const resolvedOptionalSystems = mergeOptionalSystems(
				savedOptionalSystems,
				optionalSystems,
			);

			let setupStatus:
				| "needs_input"
				| "complete"
				| "error"
				| "locked"
				| undefined;
			let setupQuestionKey: string | null | undefined;
			let setupQuestion: string | null | undefined;
			let setupPrompt: InitOutput["setupPrompt"] = null;
			let setupRevisionOutput: number | undefined;
			let setupConflict:
				| {
						detected: boolean;
						reason: string | null;
				  }
				| undefined;
			let setupIntegrity:
				| {
						ok: boolean;
						missingPaths: string[];
						invalidPaths: string[];
				  }
				| undefined;
			if (!bootstrapOnly) {
				const setup = await runGuidedSetupFlow({
					campaignBasePath: auth.campaignBasePath,
					nowIso,
					bootstrapAnswers,
					setupAnswers,
					expectedRevision: setupRevision,
				});

				setupStatus = setup.status;
				setupQuestionKey = setup.questionKey;
				setupQuestion = setup.question;
				setupPrompt = setup.setupPrompt;
				setupRevisionOutput = setup.revision;
				setupConflict = setup.conflict;
				setupIntegrity = setup.integrity;
				resolvedDiceRoller = resolvedDiceRoller ?? setup.answers.diceRoller;
				resolvedTheme =
					resolvedTheme ?? normalizeTheme(setup.answers.theme ?? undefined);

				if (setup.status !== "complete") {
					const output: InitOutput = {
						success: true,
						setupComplete: false,
						requiresUserInput: true,
						setupPrompt,
						message: setup.message,
						nextPrompts: setup.question ? [setup.question] : [],
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
						mapGenerated: false,
						startingSceneSource: "not_available",
						startingScenePreview: "",
						workspaceSummary: summary,
						statePath: paths.statePath,
						historyPath: paths.historyPath,
						bootstrap: setup.bootstrap,
						setupStatus,
						setupQuestionKey,
						setupQuestion,
						setupRevision: setupRevisionOutput,
						setupConflict,
						setupIntegrity,
						deprecationNotice: INIT_DEPRECATION_NOTICE,
					};
					recordLegacySetupPromptFields(output);
					return makeToolResult(output);
				}
			}

			const bootstrap = await runBootstrapStep({
				paths,
				nowIso,
				bootstrapAnswers,
			});

			if (!bootstrap.complete) {
				const output: InitOutput = {
					success: true,
					setupComplete: false,
					requiresUserInput: true,
					setupPrompt: null,
					message:
						"Initialization paused for bootstrap. Continue answering one prompt at a time.",
					nextPrompts: bootstrap.nextPrompt ? [bootstrap.nextPrompt] : [],
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
					mapGenerated: false,
					startingSceneSource: "not_available",
					startingScenePreview: "",
					workspaceSummary: summary,
					statePath: paths.statePath,
					historyPath: paths.historyPath,
					bootstrap: {
						complete: false,
						alreadyInitialized: bootstrap.alreadyInitialized,
						pendingQuestionKey: bootstrap.pendingQuestionKey,
						nextPrompt: bootstrap.nextPrompt,
						bootstrapPath: bootstrap.bootstrapPath,
						identityPath: bootstrap.identityPath,
						userPath: bootstrap.userPath,
						soulPath: bootstrap.soulPath,
						includeValues: bootstrap.includeValues,
						answeredCount: bootstrap.answeredCount,
						totalQuestions: bootstrap.totalQuestions,
					},
					setupStatus,
					setupQuestionKey,
					setupQuestion,
					setupRevision: setupRevisionOutput,
					setupConflict,
					setupIntegrity,
					deprecationNotice: INIT_DEPRECATION_NOTICE,
				};

				recordLegacySetupPromptFields(output);
				return makeToolResult(output);
			}

			if (bootstrapOnly) {
				const output: InitOutput = {
					success: true,
					setupComplete: true,
					requiresUserInput: false,
					setupPrompt: null,
					message: bootstrap.alreadyInitialized
						? "Bootstrap already complete."
						: "Bootstrap complete.",
					nextPrompts: [],
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
					mapGenerated: false,
					startingSceneSource: "not_available",
					startingScenePreview: "",
					workspaceSummary: summary,
					statePath: paths.statePath,
					historyPath: paths.historyPath,
					bootstrap: {
						complete: true,
						alreadyInitialized: bootstrap.alreadyInitialized,
						pendingQuestionKey: null,
						nextPrompt: null,
						bootstrapPath: bootstrap.bootstrapPath,
						identityPath: bootstrap.identityPath,
						userPath: bootstrap.userPath,
						soulPath: bootstrap.soulPath,
						includeValues: bootstrap.includeValues,
						answeredCount: bootstrap.totalQuestions,
						totalQuestions: bootstrap.totalQuestions,
					},
					setupStatus,
					setupQuestionKey,
					setupQuestion,
					setupRevision: setupRevisionOutput,
					setupConflict,
					setupIntegrity,
					deprecationNotice: INIT_DEPRECATION_NOTICE,
				};

				recordLegacySetupPromptFields(output);
				return makeToolResult(output);
			}

			if (!resolvedDiceRoller) {
				nextPrompts.push(DICE_ROLLER_SETUP_QUESTION);
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

			await persistInitSettings({
				settingsPath: paths.settingsPath,
				nowIso,
				resolvedDiceRoller,
				resolvedTheme,
				resolvedOptionalSystems,
				spawnSelection: scene.spawnSelection,
				bootstrap: {
					complete: true,
					alreadyInitialized: bootstrap.alreadyInitialized,
				},
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
				bootstrap.complete &&
				Boolean(resolvedDiceRoller) &&
				Boolean(scene.startingSceneContent.trim());
			const nextPrompt = nextPrompts[0] ?? null;
			const normalizedNextPrompts = nextPrompt ? [nextPrompt] : [];
			const requiresUserInput = normalizedNextPrompts.length > 0;
			const message = setupComplete
				? bootstrap.alreadyInitialized
					? "Initialization complete. Bootstrap was already initialized and campaign setup is ready."
					: "Initialization complete. Bootstrap, workspace, preferences, and starting scene are ready."
				: "Initialization partially complete. Additional user input is required before campaign start.";

			const output: InitOutput = {
				success: true,
				setupComplete,
				requiresUserInput,
				setupPrompt: null,
				message,
				nextPrompts: normalizedNextPrompts,
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
				bootstrap: {
					complete: true,
					alreadyInitialized: bootstrap.alreadyInitialized,
					pendingQuestionKey: null,
					nextPrompt: null,
					bootstrapPath: bootstrap.bootstrapPath,
					identityPath: bootstrap.identityPath,
					userPath: bootstrap.userPath,
					soulPath: bootstrap.soulPath,
					includeValues: bootstrap.includeValues,
					answeredCount: bootstrap.totalQuestions,
					totalQuestions: bootstrap.totalQuestions,
				},
				setupStatus,
				setupQuestionKey,
				setupQuestion,
				setupRevision: setupRevisionOutput,
				setupConflict,
				setupIntegrity,
				deprecationNotice: INIT_DEPRECATION_NOTICE,
			};

			recordLegacySetupPromptFields(output);
			return makeToolResult(output);
		},
	);
}
