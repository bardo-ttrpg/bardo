import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { slugify, toDisplayName } from "../../../domain/campaign/naming";
import {
	defaultOptionalSystems,
	loadOptionalSystems,
} from "../../../domain/campaign/optional-systems";
import { appendCanonicalEvent } from "../../../domain/events/store";
import {
	evaluateRuntimePolicy,
	loadAuthorityPolicy,
	loadTableContract,
	summarizeRuntimePolicyViolations,
} from "../../../domain/policy/runtime-guards";
import { loadPreferredCurrentState } from "../../../domain/projections/preferred-state";
import { regenerateProjectionsForEventTypes } from "../../../domain/projections/refresh";
import { resolveBardoRoot } from "../../../infra/filesystem/filesystem";
import type { AuthContext } from "../../../types/contracts";
import { makeToolResult } from "../../tool-result";
import { extractLocationNames, extractNpcNames } from "./extract";
import {
	ensureSyncedLocationFile,
	ensureSyncedNpcFile,
	ensureWorldSyncDirectories,
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
				"Persist discovered proper names from narrative text into workspace files and append canonical world-sync events.",
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
				const tableContract = await loadTableContract({ bardoRoot });
				const authorityPolicy = await loadAuthorityPolicy({ bardoRoot });
				const runtimeViolations = evaluateRuntimePolicy({
					action: transcript,
					tableContract,
					authorityPolicy,
				});
				if (runtimeViolations.length > 0) {
					const blockedMessage =
						summarizeRuntimePolicyViolations(runtimeViolations);
					await appendCanonicalEvent({
						bardoRoot,
						event: {
							id: `evt-world-sync-policy-${crypto.randomUUID()}`,
							type: "runtime_policy_blocked",
							atISO: new Date().toISOString(),
							source: "world_sync",
							data: {
								transcript,
								runtimeViolations,
								tableContract: {
									tone: tableContract.tone,
									boundaries: tableContract.boundaries,
									pvp: tableContract.pvp,
									retconPolicy: tableContract.retconPolicy,
								},
								authorityPolicy: {
									mode: authorityPolicy.mode,
									factIntroduction: authorityPolicy.factIntroduction,
									ruleAdjudication: authorityPolicy.ruleAdjudication,
									safetyVeto: authorityPolicy.safetyVeto,
									allowRuleBypass: authorityPolicy.allowRuleBypass,
									allowUnilateralRetcon: authorityPolicy.allowUnilateralRetcon,
									allowPlayerCanonDeclarations:
										authorityPolicy.allowPlayerCanonDeclarations,
								},
							},
						},
					});
					const output: WorldSyncOutput = {
						success: false,
						message: `World sync blocked by runtime policy: ${blockedMessage}`,
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
						optionalSystems,
					};
					return makeToolResult(output, true);
				}
				await ensureWorldSyncDirectories(paths);

				const extractedLocationNames = extractLocationNames(transcript);
				const extractedNpcNames = extractNpcNames(transcript);
				const createdLocationIds: string[] = [];
				const createdNpcIds: string[] = [];
				const existingLocationIds: string[] = [];
				const existingNpcIds: string[] = [];

				const preferredState = await loadPreferredCurrentState({
					bardoRoot,
					consumer: "world_sync",
				});
				const state = JSON.parse(
					JSON.stringify(preferredState.chosen.state),
				) as typeof preferredState.chosen.state;
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

				const nowIso = new Date().toISOString();
				await appendCanonicalEvent({
					bardoRoot,
					event: {
						id: `evt-world-sync-${crypto.randomUUID()}`,
						type: "world_sync_applied",
						atISO: nowIso,
						source: "world_sync",
						data: {
							extractedLocationNames,
							extractedNpcNames,
							createdLocationIds,
							createdNpcIds,
							existingLocationIds,
							existingNpcIds,
							currentLocationAfter: state.currentLocation,
							stateAfter: state,
						},
					},
				});
				await regenerateProjectionsForEventTypes({
					bardoRoot,
					eventTypes: ["world_sync_applied"],
				});

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
