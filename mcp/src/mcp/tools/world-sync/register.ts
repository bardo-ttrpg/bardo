import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { slugify, toDisplayName } from "../../../domain/campaign/naming";
import {
	defaultOptionalSystems,
	loadOptionalSystems,
} from "../../../domain/campaign/optional-systems";
import { appendCanonicalEvent } from "../../../domain/events/store";
import {
	type DiscoveryCandidate,
	mergeStructuredDiscoveries,
	resolveSceneAnchorSlug,
	upsertFaction,
	upsertThread,
} from "../../../domain/gm/runtime";
import {
	evaluateRuntimePolicy,
	loadAuthorityPolicy,
	loadTableContract,
	summarizeRuntimePolicyViolations,
} from "../../../domain/policy/runtime-guards";
import { loadPreferredCurrentState } from "../../../domain/projections/preferred-state";
import { regenerateProjectionsForEventTypes } from "../../../domain/projections/refresh";
import { withKeyedLock } from "../../../infra/concurrency/keyed-lock";
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

type WorldSyncDiscoveryInput = {
	kind: "npc" | "location" | "faction" | "item" | "clue" | "thread";
	id?: string;
	displayName: string;
	discoveryMode: "explicitly_named" | "implicitly_present" | "role_placeholder";
	confidence: "high" | "medium" | "low";
	summary?: string;
	metadata?: Record<string, unknown>;
	persisted?: boolean;
};

function normalizeDiscovery(
	input: WorldSyncDiscoveryInput,
): DiscoveryCandidate {
	const fallbackId = slugify(input.displayName, input.kind);
	return {
		kind: input.kind,
		id: input.id?.trim() ? input.id.trim() : fallbackId,
		displayName: input.displayName.trim(),
		discoveryMode: input.discoveryMode,
		confidence: input.confidence,
		summary:
			input.summary?.trim() ||
			`${input.displayName.trim()} was surfaced in the scene.`,
		metadata: input.metadata,
		persisted: input.persisted,
	};
}

function resolveLocationReference(
	locationHint: string,
	knownLocations: Record<string, unknown>,
): string {
	const trimmed = locationHint.trim();
	if (!trimmed) {
		return "current-location";
	}
	if (trimmed in knownLocations) {
		return trimmed;
	}
	if (trimmed.startsWith("loc_")) {
		return trimmed;
	}
	return slugify(trimmed, "current-location");
}

function ensureLocationRecord(
	state: Awaited<
		ReturnType<typeof loadPreferredCurrentState>
	>["chosen"]["state"],
	locationId: string,
	locationName: string,
): void {
	if (!state.locations[locationId]) {
		state.locations[locationId] = {
			name: locationName,
			visits: 0,
			npcIds: [],
			tags: [],
			exits: [],
			activeClues: [],
			occupantIds: [],
		};
	}
}

function inferTranscriptDiscoveries(args: {
	transcript: string;
	locationReference: string;
}): DiscoveryCandidate[] {
	if (
		!/\b(?:disappear|disappeared|disappearance|missing|vanish|vanished)\b/i.test(
			args.transcript,
		)
	) {
		return [];
	}

	const anchorSlug = resolveSceneAnchorSlug(args.locationReference);
	const anchorName = toDisplayName(anchorSlug);
	return [
		{
			kind: "thread",
			id: `${anchorSlug}-disappearances`,
			displayName: `${anchorName} disappearances`,
			discoveryMode: "implicitly_present",
			confidence: "high",
			summary: `The disappearances around ${anchorName} are now an active investigation thread.`,
		},
	];
}

export async function runWorldSync(args: {
	auth: AuthContext;
	transcript?: string;
	currentLocationHint?: string;
	discoveries?: WorldSyncDiscoveryInput[];
}): Promise<WorldSyncOutput> {
	const bardoRoot = resolveBardoRoot(args.auth.campaignBasePath);
	const paths = resolveWorldSyncPaths(bardoRoot);
	const transcript = args.transcript?.trim() || "";
	const explicitDiscoveries = (args.discoveries ?? []).map(normalizeDiscovery);
	const policyText =
		transcript ||
		explicitDiscoveries.map((discovery) => discovery.displayName).join(", ");

	return withKeyedLock(`workspace-mutation:${bardoRoot}`, async () => {
		const optionalSystems = await loadOptionalSystems(bardoRoot);
		const tableContract = await loadTableContract({ bardoRoot });
		const authorityPolicy = await loadAuthorityPolicy({ bardoRoot });
		const runtimeViolations = evaluateRuntimePolicy({
			action: policyText,
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
						discoveries: explicitDiscoveries,
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
			return {
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
				persistedDiscoveries: [],
				optionalSystems,
			};
		}

		await ensureWorldSyncDirectories(paths);

		const preferredState = await loadPreferredCurrentState({
			bardoRoot,
			consumer: "world_sync",
			refreshStaleProjection: true,
		});
		const state = JSON.parse(
			JSON.stringify(preferredState.chosen.state),
		) as typeof preferredState.chosen.state;
		let preferredLocationSlug = state.currentLocation;

		const transcriptDiscoveries = mergeStructuredDiscoveries(
			[
				...extractLocationNames(transcript).map(
					(locationName): DiscoveryCandidate => ({
						kind: "location",
						id: slugify(locationName, "location"),
						displayName: locationName,
						discoveryMode: "explicitly_named",
						confidence: "high",
						summary: `${locationName} is explicitly named in the transcript.`,
						metadata: {
							currentLocation:
								!args.currentLocationHint ||
								args.currentLocationHint.trim().length === 0,
						},
					}),
				),
				...extractNpcNames(transcript).map(
					(npcName): DiscoveryCandidate => ({
						kind: "npc",
						id: slugify(npcName, "npc"),
						displayName: npcName,
						discoveryMode: "explicitly_named",
						confidence: "high",
						summary: `${npcName} identifies themself in the transcript.`,
					}),
				),
				...inferTranscriptDiscoveries({
					transcript,
					locationReference:
						args.currentLocationHint?.trim() || preferredLocationSlug,
				}),
			],
			[],
		);
		const mergedDiscoveries = mergeStructuredDiscoveries(
			transcriptDiscoveries,
			explicitDiscoveries,
		);
		const extractedLocationNames = mergedDiscoveries
			.filter((discovery) => discovery.kind === "location")
			.map((discovery) => discovery.displayName);
		const extractedNpcNames = mergedDiscoveries
			.filter((discovery) => discovery.kind === "npc")
			.map((discovery) => discovery.displayName);
		const createdLocationIds: string[] = [];
		const createdNpcIds: string[] = [];
		const existingLocationIds: string[] = [];
		const existingNpcIds: string[] = [];
		const persistedDiscoveries: DiscoveryCandidate[] = [];

		if (args.currentLocationHint?.trim()) {
			preferredLocationSlug = resolveLocationReference(
				args.currentLocationHint,
				state.locations,
			);
			ensureLocationRecord(
				state,
				preferredLocationSlug,
				args.currentLocationHint.trim(),
			);
			if (optionalSystems.worldGeneration) {
				const ensuredLocation = await ensureSyncedLocationFile({
					bardoRoot,
					locationSlug: preferredLocationSlug,
					locationName:
						state.locations[preferredLocationSlug]?.name ??
						args.currentLocationHint.trim(),
				});
				if (ensuredLocation.created) {
					createdLocationIds.push(preferredLocationSlug);
				} else {
					existingLocationIds.push(preferredLocationSlug);
				}
			}
		}

		for (const discovery of mergedDiscoveries) {
			if (discovery.kind === "location") {
				const locationSlug =
					discovery.id || slugify(discovery.displayName, "location");
				ensureLocationRecord(state, locationSlug, discovery.displayName);
				const locationRecord = state.locations[locationSlug];
				if (!locationRecord) {
					continue;
				}
				locationRecord.name = discovery.displayName;
				if (discovery.metadata?.currentLocation !== false) {
					preferredLocationSlug = locationSlug;
				}
				if (optionalSystems.worldGeneration) {
					const ensuredLocation = await ensureSyncedLocationFile({
						bardoRoot,
						locationSlug,
						locationName: discovery.displayName,
					});
					if (ensuredLocation.created) {
						createdLocationIds.push(locationSlug);
					} else {
						existingLocationIds.push(locationSlug);
					}
				}
				persistedDiscoveries.push({
					...discovery,
					id: locationSlug,
					persisted: true,
				});
				continue;
			}

			if (discovery.kind === "npc") {
				if (!optionalSystems.npcs) {
					continue;
				}
				const npcId = discovery.id || slugify(discovery.displayName, "npc");
				ensureLocationRecord(
					state,
					preferredLocationSlug,
					state.locations[preferredLocationSlug]?.name ??
						toDisplayName(preferredLocationSlug),
				);
				const ensuredNpc = await ensureSyncedNpcFile({
					bardoRoot,
					npcId,
					npcName: discovery.displayName,
					currentLocation: preferredLocationSlug,
				});
				if (ensuredNpc.created) {
					createdNpcIds.push(npcId);
				} else {
					existingNpcIds.push(npcId);
				}
				if (!state.npcs[npcId]) {
					state.npcs[npcId] = {
						id: npcId,
						displayName: discovery.displayName,
						aliases: [],
						role:
							typeof discovery.metadata?.role === "string"
								? discovery.metadata.role
								: null,
						disposition: "neutral",
						currentLocation: preferredLocationSlug,
						introduced: discovery.discoveryMode === "explicitly_named",
						discovered: true,
					};
				} else {
					const existingNpc = state.npcs[npcId];
					if (
						existingNpc.displayName !== discovery.displayName &&
						!existingNpc.aliases.includes(existingNpc.displayName)
					) {
						existingNpc.aliases.push(existingNpc.displayName);
					}
					existingNpc.displayName = discovery.displayName;
					existingNpc.role =
						typeof discovery.metadata?.role === "string"
							? discovery.metadata.role
							: existingNpc.role;
					existingNpc.currentLocation = preferredLocationSlug;
					existingNpc.introduced =
						existingNpc.introduced ||
						discovery.discoveryMode === "explicitly_named";
					existingNpc.discovered = true;
				}
				const location = state.locations[preferredLocationSlug];
				if (location && !location.npcIds.includes(npcId)) {
					location.npcIds.push(npcId);
				}
				if (location && !location.occupantIds.includes(npcId)) {
					location.occupantIds.push(npcId);
				}
				persistedDiscoveries.push({
					...discovery,
					id: npcId,
					persisted: true,
				});
				continue;
			}

			if (discovery.kind === "thread") {
				const threadId = slugify(
					discovery.id || discovery.displayName,
					"thread",
				);
				upsertThread(state, {
					id: threadId,
					title: discovery.displayName,
					status: discovery.confidence === "high" ? "active" : "open",
					urgency: discovery.confidence === "high" ? "high" : "medium",
					summary: discovery.summary,
				});
				persistedDiscoveries.push({
					...discovery,
					id: threadId,
					persisted: true,
				});
				continue;
			}

			if (discovery.kind === "faction") {
				const factionId = slugify(
					discovery.id || discovery.displayName,
					"faction",
				);
				upsertFaction(state, {
					id: factionId,
					name: discovery.displayName,
					stance: "neutral",
					pressure: 0,
					openConflict: false,
				});
				persistedDiscoveries.push({
					...discovery,
					id: factionId,
					persisted: true,
				});
				continue;
			}

			persistedDiscoveries.push({
				...discovery,
				persisted: true,
			});
		}

		if (preferredLocationSlug) {
			state.currentLocation = preferredLocationSlug;
			state.party.currentLocation = preferredLocationSlug;
		}
		state.lastAction = "world_sync";
		state.scene.summary = `Narrative discoveries were synchronized around ${state.locations[state.currentLocation]?.name ?? toDisplayName(state.currentLocation)}.`;
		state.scene.activeSituation =
			"Review the newly persisted discoveries before advancing play.";
		state.scene.unresolvedQuestions = persistedDiscoveries
			.filter(
				(discovery) => discovery.kind === "thread" || discovery.kind === "clue",
			)
			.map((discovery) => discovery.summary)
			.slice(0, 3);

		const nowIso = new Date().toISOString();
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: `evt-world-sync-${crypto.randomUUID()}`,
				type: "world_sync_applied",
				atISO: nowIso,
				source: "world_sync",
				data: {
					transcript,
					extractedLocationNames,
					extractedNpcNames,
					createdLocationIds,
					createdNpcIds,
					existingLocationIds,
					existingNpcIds,
					currentLocationAfter: state.currentLocation,
					persistedDiscoveries,
					stateAfter: state,
				},
			},
		});
		await regenerateProjectionsForEventTypes({
			bardoRoot,
			eventTypes: ["world_sync_applied"],
		});

		return {
			success: true,
			message:
				persistedDiscoveries.length === 0
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
			persistedDiscoveries,
			optionalSystems,
		};
	});
}

export function registerWorldSyncTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"world_sync",
		{
			title: "Sync Narrative Discoveries",
			description:
				"Persist discovered proper names from narrative text or structured discoveries into workspace files and append canonical world-sync events.",
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
		async ({ transcript, currentLocationHint, discoveries }) => {
			try {
				const output = await runWorldSync({
					auth,
					transcript,
					currentLocationHint,
					discoveries,
				});
				return makeToolResult(output, !output.success);
			} catch (error) {
				const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
				const paths = resolveWorldSyncPaths(bardoRoot);
				const output: WorldSyncOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to sync narrative discoveries: ${error.message}`
							: "Failed to sync narrative discoveries.",
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
					persistedDiscoveries: [],
					optionalSystems: { ...defaultOptionalSystems },
				};
				return makeToolResult(output, true);
			}
		},
	);
}
