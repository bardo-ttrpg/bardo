import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toDisplayName } from "../../../domain/campaign/naming";
import {
	defaultOptionalSystems,
	loadOptionalSystems,
} from "../../../domain/campaign/optional-systems";
import { resolveFeatureFlags } from "../../../domain/config/features";
import {
	getIdempotentResult,
	setIdempotentResult,
} from "../../../domain/idempotency/store";
import { resolveBardoRoot } from "../../../infra/filesystem/filesystem";
import type { AuthContext } from "../../../types/contracts";
import { makeToolResult } from "../../tool-result";
import {
	type GuidedSetupFlowResult,
	runGuidedSetupFlow,
} from "../init/setup-flow";
import type { SetupAnswers } from "../init/setup-schemas";
import {
	defaultAdvanceMinutes,
	extractTargetLocation,
	normalizeIsoDate,
	parseIntent,
	resolveTravelTarget,
} from "./parsing";
import {
	appendHistoryEntry,
	buildHistoryEntry,
	createUnknownNpc,
	ensureLocationFile,
	ensurePlayerActionDirectories,
	loadCampaignState,
	loadKnownLocations,
	persistCampaignState,
	resolvePlayerActionPaths,
} from "./persistence";
import {
	narrationGuardrails,
	type PlayerActionOutput,
	playerActionInputSchema,
	playerActionOutputSchema,
} from "./schemas";

const PLAYER_ACTION_SCOPE = "player_action";

type SetupRuntimeState = {
	status: GuidedSetupFlowResult["status"];
	questionKey: GuidedSetupFlowResult["questionKey"];
	question: GuidedSetupFlowResult["question"];
	progressAnswered: number;
	progressTotal: number;
	warnings: string[];
	evidenceSummary: string[];
	revision: number;
	conflict: {
		detected: boolean;
		reason: string | null;
	};
	integrity: {
		ok: boolean;
		missingPaths: string[];
		invalidPaths: string[];
	};
	actionToExecute: string | null;
	pendingAction: string | null;
};

function defaultSetupBypassState(): SetupRuntimeState {
	return {
		status: "complete",
		questionKey: null,
		question: null,
		progressAnswered: 0,
		progressTotal: 0,
		warnings: [],
		evidenceSummary: [],
		revision: 0,
		conflict: {
			detected: false,
			reason: null,
		},
		integrity: {
			ok: true,
			missingPaths: [],
			invalidPaths: [],
		},
		actionToExecute: null,
		pendingAction: null,
	};
}

export async function runPlayerAction(args: {
	auth: AuthContext;
	action: string;
	bootstrapAnswers?: Record<string, string>;
	setupAnswers?: SetupAnswers;
	setupRevision?: number;
	idempotencyKey?: string;
	guidedSetupEnabled?: boolean;
	nowIso?: string;
}): Promise<PlayerActionOutput> {
	const bardoRoot = resolveBardoRoot(args.auth.campaignBasePath);
	const paths = resolvePlayerActionPaths(bardoRoot);
	const nowIso = args.nowIso ?? new Date().toISOString();
	const guidedSetupEnabled =
		args.guidedSetupEnabled ?? resolveFeatureFlags(Bun.env).guidedSetupEnabled;
	const createdNpcIds: string[] = [];
	const createdLocationIds: string[] = [];

	try {
		if (args.idempotencyKey) {
			const replay = await getIdempotentResult({
				bardoRoot,
				key: args.idempotencyKey,
				scope: PLAYER_ACTION_SCOPE,
			});
			if (typeof replay === "object" && replay !== null) {
				return {
					...(replay as PlayerActionOutput),
					idempotentReplay: true,
				};
			}
		}

		let setup = defaultSetupBypassState();
		let actionToRun = args.action;

		if (guidedSetupEnabled) {
			const setupResult = await runGuidedSetupFlow({
				campaignBasePath: args.auth.campaignBasePath,
				nowIso,
				bootstrapAnswers: args.bootstrapAnswers,
				setupAnswers: args.setupAnswers,
				expectedRevision: args.setupRevision,
				incomingAction: args.action,
			});
			setup = {
				status: setupResult.status,
				questionKey: setupResult.questionKey,
				question: setupResult.question,
				progressAnswered: setupResult.progressAnswered,
				progressTotal: setupResult.progressTotal,
				warnings: setupResult.warnings,
				evidenceSummary: setupResult.evidenceSummary,
				revision: setupResult.revision,
				conflict: setupResult.conflict,
				integrity: setupResult.integrity,
				actionToExecute: setupResult.actionToExecute,
				pendingAction: setupResult.pendingAction,
			};

			if (setupResult.status !== "complete") {
				return {
					success: true,
					message:
						setupResult.status === "locked"
							? setupResult.message
							: "Setup is required before gameplay can proceed.",
					idempotentReplay: false,
					rootPath: bardoRoot,
					intent: "general",
					timeAdvancedMinutes: 0,
					worldTimeBeforeISO: "",
					worldTimeAfterISO: "",
					locationBefore: "",
					locationAfter: "",
					createdNpcIds: [],
					createdLocationIds: [],
					historyEntry: "",
					statePath: paths.statePath,
					historyPath: paths.historyPath,
					narrationGuardrails: [...narrationGuardrails],
					optionalSystems: { ...defaultOptionalSystems },
					requiresSetup: true,
					setupStatus: setupResult.status,
					setupQuestionKey: setupResult.questionKey,
					setupQuestion: setupResult.question,
					setupProgressAnswered: setupResult.progressAnswered,
					setupProgressTotal: setupResult.progressTotal,
					setupWarnings: setupResult.warnings,
					setupEvidenceSummary: setupResult.evidenceSummary,
					setupRevision: setupResult.revision,
					setupConflict: setupResult.conflict,
					setupIntegrity: setupResult.integrity,
					pendingAction: setupResult.pendingAction,
				};
			}

			actionToRun = setupResult.actionToExecute ?? args.action;
		}

		const optionalSystems = await loadOptionalSystems(bardoRoot);
		const knownLocations = await loadKnownLocations(bardoRoot);
		await ensurePlayerActionDirectories(bardoRoot, paths);

		const state = await loadCampaignState(paths.statePath);
		const intent = parseIntent(actionToRun);
		const locationBefore = state.currentLocation;
		const targetLocationText = extractTargetLocation(actionToRun);
		let locationAfter = state.currentLocation;

		if (intent === "travel" && targetLocationText) {
			const resolved = resolveTravelTarget(targetLocationText, knownLocations);
			const targetSlug = resolved.slug;
			locationAfter = targetSlug;
			if (!state.locations[targetSlug]) {
				state.locations[targetSlug] = {
					name: resolved.name,
					visits: 0,
					npcIds: [],
				};
			}

			if (optionalSystems.worldGeneration) {
				const ensuredLocation = await ensureLocationFile({
					bardoRoot,
					locationSlug: targetSlug,
					locationName: state.locations[targetSlug].name,
				});
				if (ensuredLocation.created) {
					createdLocationIds.push(targetSlug);
				}
			}
		}

		if (!state.locations[locationAfter]) {
			state.counters.unknownLocation += 1;
			const generatedSlug =
				locationAfter || `unknown-location-${state.counters.unknownLocation}`;
			locationAfter = generatedSlug;
			state.locations[generatedSlug] = {
				name: toDisplayName(generatedSlug),
				visits: 0,
				npcIds: [],
			};
			if (optionalSystems.worldGeneration) {
				const ensuredLocation = await ensureLocationFile({
					bardoRoot,
					locationSlug: generatedSlug,
					locationName: state.locations[generatedSlug].name,
				});
				if (ensuredLocation.created) {
					createdLocationIds.push(generatedSlug);
				}
			}
		}

		state.currentLocation = locationAfter;
		const locationRecord = state.locations[locationAfter];
		if (!locationRecord) {
			throw new Error("Failed to resolve location record for action.");
		}
		locationRecord.visits += 1;

		const shouldSpawnAmbient = intent === "travel" || intent === "explore";
		if (shouldSpawnAmbient && optionalSystems.npcs) {
			const existingAtLocation = locationRecord.npcIds.length;
			const desiredMinimum = 2;
			const toCreate = Math.max(0, desiredMinimum - existingAtLocation);
			for (let i = 0; i < toCreate; i += 1) {
				state.counters.unknownNpc += 1;
				const npc = await createUnknownNpc({
					bardoRoot,
					npcIndex: state.counters.unknownNpc,
					locationSlug: locationAfter,
				});
				locationRecord.npcIds.push(npc.id);
				createdNpcIds.push(npc.id);
			}
		}

		const worldTimeBeforeISO = normalizeIsoDate(state.worldTimeISO);
		const advance = defaultAdvanceMinutes(intent);
		const nextWorldTime = new Date(worldTimeBeforeISO);
		nextWorldTime.setMinutes(nextWorldTime.getMinutes() + advance);
		const worldTimeAfterISO = nextWorldTime.toISOString();
		state.worldTimeISO = worldTimeAfterISO;
		state.lastAction = actionToRun;

		await persistCampaignState(paths.statePath, state);
		const historyEntry = buildHistoryEntry({
			worldTimeAfterISO,
			intent,
			action: actionToRun,
			locationBefore,
			locationAfter,
			newNpcCount: createdNpcIds.length,
			newLocationCount: createdLocationIds.length,
		});
		await appendHistoryEntry(paths.historyPath, historyEntry);

		const output: PlayerActionOutput = {
			success: true,
			message:
				createdNpcIds.length > 0 || createdLocationIds.length > 0
					? "Action processed. Time advanced and world context expanded automatically."
					: "Action processed. Time advanced and state updated.",
			idempotentReplay: false,
			rootPath: bardoRoot,
			intent,
			timeAdvancedMinutes: advance,
			worldTimeBeforeISO,
			worldTimeAfterISO,
			locationBefore,
			locationAfter,
			createdNpcIds,
			createdLocationIds,
			historyEntry,
			statePath: paths.statePath,
			historyPath: paths.historyPath,
			narrationGuardrails: [...narrationGuardrails],
			optionalSystems,
			requiresSetup: false,
			setupStatus: setup.status,
			setupQuestionKey: null,
			setupQuestion: null,
			setupProgressAnswered: setup.progressAnswered,
			setupProgressTotal: setup.progressTotal,
			setupWarnings: setup.warnings,
			setupEvidenceSummary: setup.evidenceSummary,
			setupRevision: setup.revision,
			setupConflict: setup.conflict,
			setupIntegrity: setup.integrity,
			pendingAction: null,
		};

		if (args.idempotencyKey) {
			await setIdempotentResult({
				bardoRoot,
				key: args.idempotencyKey,
				scope: PLAYER_ACTION_SCOPE,
				result: output,
				nowIso,
			});
		}

		return output;
	} catch (error) {
		return {
			success: false,
			message:
				error instanceof Error
					? `Failed to process player action: ${error.message}`
					: "Failed to process player action.",
			idempotentReplay: false,
			rootPath: bardoRoot,
			intent: "general",
			timeAdvancedMinutes: 0,
			worldTimeBeforeISO: "",
			worldTimeAfterISO: "",
			locationBefore: "",
			locationAfter: "",
			createdNpcIds: [],
			createdLocationIds: [],
			historyEntry: "",
			statePath: paths.statePath,
			historyPath: paths.historyPath,
			narrationGuardrails: [],
			optionalSystems: { ...defaultOptionalSystems },
			requiresSetup: false,
			setupStatus: "error",
			setupQuestionKey: null,
			setupQuestion: null,
			setupProgressAnswered: 0,
			setupProgressTotal: 0,
			setupWarnings: [],
			setupEvidenceSummary: [],
			setupRevision: 0,
			setupConflict: {
				detected: false,
				reason: null,
			},
			setupIntegrity: {
				ok: false,
				missingPaths: [],
				invalidPaths: [],
			},
			pendingAction: null,
		};
	}
}

export function registerPlayerActionTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"player_action",
		{
			title: "Process Player Action (Primary)",
			description:
				"Primary high-level gameplay tool and default for narrative user inputs (for example: `I travel to the village`, `I explore the ruins`, `I talk to the bartender`). It parses intent, advances world time automatically, updates persistent state/history, and creates unknown NPCs/locations when appropriate.",
			inputSchema: playerActionInputSchema,
			outputSchema: playerActionOutputSchema,
			annotations: {
				title: "Process Player Action",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: true,
			},
		},
		async ({
			action,
			bootstrapAnswers,
			setupAnswers,
			setupRevision,
			idempotencyKey,
		}) => {
			const output = await runPlayerAction({
				auth,
				action,
				bootstrapAnswers,
				setupAnswers,
				setupRevision,
				idempotencyKey,
			});
			return makeToolResult(output, !output.success);
		},
	);
}
