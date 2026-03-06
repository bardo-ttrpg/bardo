import { mkdir, readdir, writeFile } from "node:fs/promises";
import { toDisplayName } from "../../../domain/campaign/naming";
import {
	parseMarkdown,
	renderMarkdown,
} from "../../../domain/markdown/markdown";
import {
	ensureParentDirectoryExists,
	readTextIfExists,
	resolvePathInsideRoot,
} from "../../../infra/filesystem/filesystem";
import type { KnownLocation, PlayerActionPaths } from "./types";

export function resolvePlayerActionPaths(bardoRoot: string): PlayerActionPaths {
	return {
		statePath: resolvePathInsideRoot(bardoRoot, "state/current.md"),
		historyPath: resolvePathInsideRoot(bardoRoot, "state/history.md"),
		entitiesDir: resolvePathInsideRoot(bardoRoot, "entities"),
		locationsDir: resolvePathInsideRoot(bardoRoot, "world/locations"),
		stateDir: resolvePathInsideRoot(bardoRoot, "state"),
	};
}

export async function ensurePlayerActionDirectories(
	bardoRoot: string,
	paths: PlayerActionPaths,
): Promise<void> {
	await mkdir(bardoRoot, { recursive: true });
	await mkdir(paths.entitiesDir, { recursive: true });
	await mkdir(paths.locationsDir, { recursive: true });
	await mkdir(paths.stateDir, { recursive: true });
}

export async function loadKnownLocations(
	bardoRoot: string,
): Promise<KnownLocation[]> {
	const locationsDir = resolvePathInsideRoot(bardoRoot, "world/locations");
	try {
		const entries = await readdir(locationsDir, { withFileTypes: true });
		const known: KnownLocation[] = [];
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
				continue;
			}

			const locationPath = resolvePathInsideRoot(
				bardoRoot,
				`world/locations/${entry.name}`,
			);
			const raw = await readTextIfExists(locationPath);
			if (raw === null) {
				continue;
			}

			const parsed = parseMarkdown(raw);
			const slug = entry.name.replace(/\.md$/i, "");
			const name = parsed.frontmatter.title?.trim() || toDisplayName(slug);
			known.push({ slug, name });
		}
		return known;
	} catch {
		return [];
	}
}

export async function ensureLocationFile(args: {
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
	const payload = {
		id: args.locationSlug,
		name: args.locationName,
		discoveryStatus: "unknown",
		tags: ["location", "point_of_interest"],
		notes: "Auto-generated from player action. Expand with concrete details.",
	};
	await writeFile(
		locationPath,
		renderMarkdown(
			{
				description: "Location or point of interest",
				title: args.locationName,
			},
			JSON.stringify(payload, null, 2),
		),
		"utf8",
	);
	return { created: true, path: locationPath };
}

export async function createUnknownNpc(args: {
	bardoRoot: string;
	npcIndex: number;
	locationSlug: string;
}): Promise<{ id: string; path: string }> {
	const npcId = `unknown_npc_${String(args.npcIndex).padStart(2, "0")}`;
	const npcPath = resolvePathInsideRoot(args.bardoRoot, `entities/${npcId}.md`);
	await ensureParentDirectoryExists(npcPath);
	const payload = {
		id: npcId,
		publicName: `Unknown NPC ${String(args.npcIndex).padStart(2, "0")}`,
		trueName: null,
		discoveryStatus: "unknown",
		knownByPlayer: false,
		currentLocation: args.locationSlug,
		revealConditions: [
			"Spend meaningful time interacting",
			"Learn a personal detail or earn trust",
		],
		notes: "Auto-generated ambient NPC. Discover identity through play.",
	};

	await writeFile(
		npcPath,
		renderMarkdown(
			{
				description:
					"NPC record; initially unknown until discovered by the player",
				title: `Unknown NPC ${String(args.npcIndex).padStart(2, "0")}`,
			},
			JSON.stringify(payload, null, 2),
		),
		"utf8",
	);

	return { id: npcId, path: npcPath };
}

export async function ensureNpcFile(args: {
	bardoRoot: string;
	npcId: string;
	npcName: string;
	currentLocation: string;
	role?: string | null;
	knownByPlayer?: boolean;
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
	const knownByPlayer =
		args.knownByPlayer ?? !args.npcName.startsWith("Unknown ");
	await writeFile(
		npcPath,
		renderMarkdown(
			{
				description: "NPC record synchronized from action-driven discovery",
				title: args.npcName,
			},
			JSON.stringify(
				{
					id: args.npcId,
					publicName: args.npcName,
					trueName: knownByPlayer ? args.npcName : null,
					discoveryStatus: knownByPlayer ? "known" : "unknown",
					knownByPlayer,
					currentLocation: args.currentLocation,
					role: args.role ?? null,
					notes:
						"Auto-generated from player action. Expand identity, goals, and relationships through play.",
				},
				null,
				2,
			),
		),
		"utf8",
	);

	return { created: true, path: npcPath };
}

export function buildHistoryEntry(args: {
	worldTimeAfterISO: string;
	intent: string;
	action: string;
	locationBefore: string;
	locationAfter: string;
	newNpcCount: number;
	newLocationCount: number;
}): string {
	return `${args.worldTimeAfterISO} | intent=${args.intent} | action="${args.action}" | from=${args.locationBefore} | to=${args.locationAfter} | new_npcs=${args.newNpcCount} | new_locations=${args.newLocationCount}`;
}
