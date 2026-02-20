import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { slugify, toDisplayName } from "../../../domain/campaign/naming";
import {
	defaultOptionalSystems,
	loadOptionalSystems,
} from "../../../domain/campaign/optional-systems";
import { resolveBardoRoot } from "../../../infra/filesystem/filesystem";
import type { AuthContext } from "../../../types/contracts";
import { makeToolResult } from "../../tool-result";
import { extractLocationNames, extractNpcNames } from "./extract";
import {
	appendHistoryEntry,
	buildWorldSyncHistoryEntry,
	ensureSyncedLocationFile,
	ensureSyncedNpcFile,
	ensureWorldSyncDirectories,
	loadCampaignState,
	persistCampaignState,
	resolveWorldSyncPaths,
} from "./persistence";
import {
	type WorldSyncOutput,
	worldSyncInputSchema,
	worldSyncOutputSchema,
} from "./schemas";

export function registerWorldSyncTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"world_sync",
		{
			title: "Sync Narrative Discoveries",
			description:
				"Persist discovered proper names from narrative text into workspace files and state. Use this when narration introduces a new location or NPC so canon data stays consistent.",
			inputSchema: worldSyncInputSchema,
			outputSchema: worldSyncOutputSchema,
			annotations: {
				title: "Sync Narrative Discoveries",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async ({ transcript, currentLocationHint }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const paths = resolveWorldSyncPaths(bardoRoot);

			try {
				const optionalSystems = await loadOptionalSystems(bardoRoot);
				await ensureWorldSyncDirectories(paths);

				const extractedLocationNames = extractLocationNames(transcript);
				const extractedNpcNames = extractNpcNames(transcript);
				const createdLocationIds: string[] = [];
				const createdNpcIds: string[] = [];
				const existingLocationIds: string[] = [];
				const existingNpcIds: string[] = [];

				const state = await loadCampaignState(paths.statePath);
				let preferredLocationSlug = state.currentLocation;
				if (currentLocationHint?.trim()) {
					preferredLocationSlug = slugify(currentLocationHint);
				}

				for (const locationName of extractedLocationNames) {
					const locationSlug = slugify(locationName);
					if (!state.locations[locationSlug]) {
						state.locations[locationSlug] = {
							name: locationName,
							visits: 0,
							npcIds: [],
						};
					}

					if (optionalSystems.worldGeneration) {
						const ensuredLocation = await ensureSyncedLocationFile({
							bardoRoot,
							locationSlug,
							locationName,
						});
						if (ensuredLocation.created) {
							createdLocationIds.push(locationSlug);
						} else {
							existingLocationIds.push(locationSlug);
						}
					}

					preferredLocationSlug = locationSlug;
				}

				for (const npcName of extractedNpcNames) {
					if (!optionalSystems.npcs) {
						continue;
					}

					const npcId = slugify(npcName);
					const ensuredNpc = await ensureSyncedNpcFile({
						bardoRoot,
						npcId,
						npcName,
						currentLocation: preferredLocationSlug,
					});
					if (ensuredNpc.created) {
						createdNpcIds.push(npcId);
					} else {
						existingNpcIds.push(npcId);
					}

					if (!state.locations[preferredLocationSlug]) {
						state.locations[preferredLocationSlug] = {
							name: toDisplayName(preferredLocationSlug),
							visits: 0,
							npcIds: [],
						};
					}
					if (!state.locations[preferredLocationSlug]?.npcIds.includes(npcId)) {
						state.locations[preferredLocationSlug]?.npcIds.push(npcId);
					}
				}

				if (preferredLocationSlug) {
					state.currentLocation = preferredLocationSlug;
				}
				state.lastAction = "world_sync";

				await persistCampaignState(paths.statePath, state);
				const historyEntry = buildWorldSyncHistoryEntry({
					nowIso: new Date().toISOString(),
					createdLocationCount: createdLocationIds.length,
					createdNpcCount: createdNpcIds.length,
				});
				await appendHistoryEntry(paths.historyPath, historyEntry);

				const output: WorldSyncOutput = {
					success: true,
					message:
						createdLocationIds.length === 0 && createdNpcIds.length === 0
							? "World sync complete. No new entities were added."
							: "World sync complete. Narrative discoveries were persisted.",
					rootPath: bardoRoot,
					statePath: paths.statePath,
					historyPath: paths.historyPath,
					extractedLocationNames,
					extractedNpcNames,
					createdLocationIds,
					createdNpcIds,
					existingLocationIds,
					existingNpcIds,
					currentLocationAfter: state.currentLocation,
					optionalSystems,
				};
				return makeToolResult(output);
			} catch (error) {
				const output: WorldSyncOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to sync world discoveries: ${error.message}`
							: "Failed to sync world discoveries.",
					rootPath: bardoRoot,
					statePath: paths.statePath,
					historyPath: paths.historyPath,
					extractedLocationNames: [],
					extractedNpcNames: [],
					createdLocationIds: [],
					createdNpcIds: [],
					existingLocationIds: [],
					existingNpcIds: [],
					currentLocationAfter: "",
					optionalSystems: { ...defaultOptionalSystems },
				};
				return makeToolResult(output, true);
			}
		},
	);
}
