import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toDisplayName } from "../../../domain/campaign/naming";
import {
	defaultOptionalSystems,
	loadOptionalSystems,
} from "../../../domain/campaign/optional-systems";
import { resolveBardoRoot } from "../../../infra/filesystem/filesystem";
import type { AuthContext } from "../../../types/contracts";
import { makeToolResult } from "../../tool-result";
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
		async ({ action }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const paths = resolvePlayerActionPaths(bardoRoot);
			const createdNpcIds: string[] = [];
			const createdLocationIds: string[] = [];

			try {
				const optionalSystems = await loadOptionalSystems(bardoRoot);
				const knownLocations = await loadKnownLocations(bardoRoot);
				await ensurePlayerActionDirectories(bardoRoot, paths);

				const state = await loadCampaignState(paths.statePath);
				const intent = parseIntent(action);
				const locationBefore = state.currentLocation;
				const targetLocationText = extractTargetLocation(action);
				let locationAfter = state.currentLocation;

				if (intent === "travel" && targetLocationText) {
					const resolved = resolveTravelTarget(
						targetLocationText,
						knownLocations,
					);
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
						locationAfter ||
						`unknown-location-${state.counters.unknownLocation}`;
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
				state.lastAction = action;

				await persistCampaignState(paths.statePath, state);
				const historyEntry = buildHistoryEntry({
					worldTimeAfterISO,
					intent,
					action,
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
				};
				return makeToolResult(output);
			} catch (error) {
				const output: PlayerActionOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to process player action: ${error.message}`
							: "Failed to process player action.",
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
				};
				return makeToolResult(output, true);
			}
		},
	);
}
