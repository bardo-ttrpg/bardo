import { mkdir, writeFile } from "node:fs/promises";
import { safeParseState } from "../../../domain/campaign/state";
import type { CampaignState } from "../../../domain/campaign/types";
import {
	parseMarkdown,
	renderMarkdown,
} from "../../../domain/markdown/markdown";
import {
	ensureParentDirectoryExists,
	readTextIfExists,
	resolvePathInsideRoot,
} from "../../../infra/filesystem/filesystem";

export type WorldSyncPaths = {
	statePath: string;
	historyPath: string;
	entitiesDir: string;
	locationsDir: string;
	stateDir: string;
};

export function resolveWorldSyncPaths(bardoRoot: string): WorldSyncPaths {
	return {
		statePath: resolvePathInsideRoot(bardoRoot, "state/current.md"),
		historyPath: resolvePathInsideRoot(bardoRoot, "state/history.md"),
		entitiesDir: resolvePathInsideRoot(bardoRoot, "entities"),
		locationsDir: resolvePathInsideRoot(bardoRoot, "world/locations"),
		stateDir: resolvePathInsideRoot(bardoRoot, "state"),
	};
}

export async function ensureWorldSyncDirectories(
	paths: WorldSyncPaths,
): Promise<void> {
	await mkdir(paths.entitiesDir, { recursive: true });
	await mkdir(paths.locationsDir, { recursive: true });
	await mkdir(paths.stateDir, { recursive: true });
}

export async function loadCampaignState(
	statePath: string,
): Promise<CampaignState> {
	const rawStateMarkdown = await readTextIfExists(statePath);
	const parsedStateMarkdown = rawStateMarkdown
		? parseMarkdown(rawStateMarkdown)
		: { frontmatter: {}, content: "" };
	return safeParseState(parsedStateMarkdown.content);
}

export async function ensureSyncedLocationFile(args: {
	bardoRoot: string;
	locationSlug: string;
	locationName: string;
}): Promise<{ created: boolean; path: string }> {
	const locationPath = resolvePathInsideRoot(
		args.bardoRoot,
		`world/locations/${args.locationSlug}.md`,
	);
	const existing = await readTextIfExists(locationPath);
	if (existing !== null) {
		return { created: false, path: locationPath };
	}

	await ensureParentDirectoryExists(locationPath);
	await writeFile(
		locationPath,
		renderMarkdown(
			{
				description: "Location or point of interest",
				title: args.locationName,
			},
			JSON.stringify(
				{
					id: args.locationSlug,
					name: args.locationName,
					discoveryStatus: "known",
					tags: ["location"],
					notes:
						"Synchronized from narrative discovery. Expand details as campaign evolves.",
				},
				null,
				2,
			),
		),
		"utf8",
	);
	return { created: true, path: locationPath };
}

export async function ensureSyncedNpcFile(args: {
	bardoRoot: string;
	npcId: string;
	npcName: string;
	currentLocation: string;
}): Promise<{ created: boolean; path: string }> {
	const npcPath = resolvePathInsideRoot(
		args.bardoRoot,
		`entities/${args.npcId}.md`,
	);
	const existing = await readTextIfExists(npcPath);
	if (existing !== null) {
		return { created: false, path: npcPath };
	}

	await ensureParentDirectoryExists(npcPath);
	await writeFile(
		npcPath,
		renderMarkdown(
			{
				description: "NPC record synchronized from narrative discovery",
				title: args.npcName,
			},
			JSON.stringify(
				{
					id: args.npcId,
					publicName: args.npcName,
					trueName: args.npcName,
					discoveryStatus: "known",
					knownByPlayer: true,
					currentLocation: args.currentLocation,
					notes:
						"Name discovered in narrative; expand role, goals, and relationships.",
				},
				null,
				2,
			),
		),
		"utf8",
	);

	return { created: true, path: npcPath };
}

export async function persistCampaignState(
	statePath: string,
	state: CampaignState,
): Promise<void> {
	await ensureParentDirectoryExists(statePath);
	await writeFile(
		statePath,
		renderMarkdown(
			{
				description: "Current campaign state and memory snapshot",
				title: "Campaign State",
			},
			JSON.stringify(state, null, 2),
		),
		"utf8",
	);
}

export function buildWorldSyncHistoryEntry(args: {
	nowIso: string;
	createdLocationCount: number;
	createdNpcCount: number;
}): string {
	return `${args.nowIso} | intent=sync | action="world_sync" | locations_created=${args.createdLocationCount} | npcs_created=${args.createdNpcCount}`;
}

export async function appendHistoryEntry(
	historyPath: string,
	historyEntry: string,
): Promise<void> {
	const existingHistory = await readTextIfExists(historyPath);
	const parsedHistory = existingHistory
		? parseMarkdown(existingHistory)
		: { frontmatter: {}, content: "" };
	const nextHistoryContent = parsedHistory.content.trim()
		? `${parsedHistory.content.trimEnd()}\n${historyEntry}`
		: historyEntry;

	await ensureParentDirectoryExists(historyPath);
	await writeFile(
		historyPath,
		renderMarkdown(
			{
				description: "Chronological campaign action history log",
				title: "Campaign History",
			},
			nextHistoryContent,
		),
		"utf8",
	);
}
