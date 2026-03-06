import { mkdir, writeFile } from "node:fs/promises";
import {
	parseMarkdown,
	renderMarkdown,
} from "../../../domain/markdown/markdown";
import {
	ensureParentDirectoryExists,
	readTextIfExists,
	resolvePathInsideRoot,
} from "../../../infra/filesystem/filesystem";

type WorldSyncPaths = {
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
		const existingData = JSON.parse(parseMarkdown(existing).content) as {
			publicName?: string;
			trueName?: string;
			currentLocation?: string;
		};
		await writeFile(
			npcPath,
			renderMarkdown(
				{
					description: "NPC record synchronized from narrative discovery",
					title: args.npcName,
				},
				JSON.stringify(
					{
						...existingData,
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
