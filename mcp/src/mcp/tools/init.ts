import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { BARDO_SUBDIRECTORIES } from "../../domain/config/constants";
import { parseMarkdown, renderMarkdown } from "../../domain/markdown/markdown";
import {
	ensureParentDirectoryExists,
	inspectPath,
	readTextIfExists,
	resolveBardoRoot,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

type DiceRoller = "player" | "bardo";
type OptionalSystems = {
	npcs: boolean;
	quests: boolean;
	items: boolean;
	worldGeneration: boolean;
};
type ThemeCategory =
	| "fantasy"
	| "sci-fi"
	| "post-apocalyptic"
	| "horror"
	| "modern"
	| "other";

type WorkspaceHint = {
	firstLocationName: string | null;
	firstLocationSlug: string | null;
	firstQuestTitle: string | null;
	firstPartyTitle: string | null;
};

type WorkspaceSummary = {
	markdownFiles: number;
	informativeFiles: number;
	totalContentChars: number;
	informativeByDirectory: Record<string, number>;
	looksSufficientForAutoScene: boolean;
	worldLocationFiles: number;
	worldInformativeFiles: number;
	workspaceEmpty: boolean;
};

type ProceduralMapResult = {
	sceneText: string;
	startingLocationName: string;
	startingLocationSlug: string;
	mapData: Record<string, unknown>;
};

type LocationCandidate = {
	slug: string;
	name: string;
};

type SpawnOrigin = "workspace" | "map" | "wilderness" | "existing_state";

type SpawnSelection = {
	slug: string;
	name: string;
	origin: SpawnOrigin;
};

const defaultOptionalSystems: OptionalSystems = {
	npcs: true,
	quests: true,
	items: true,
	worldGeneration: true,
};

function parseJsonObject(raw: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(raw);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
		) {
			return parsed as Record<string, unknown>;
		}
		return null;
	} catch {
		return null;
	}
}

function normalizeTheme(input: string | undefined): string | null {
	const trimmed = input?.trim();
	return trimmed ? trimmed : null;
}

function inferThemeCategory(theme: string): ThemeCategory {
	const text = theme.toLowerCase();
	if (
		/(sci|space|star|galaxy|cyber|mech|alien|futur|spaceship|planet)/.test(text)
	) {
		return "sci-fi";
	}
	if (/(fantasy|sword|magic|dragon|kingdom|dungeon|myth)/.test(text)) {
		return "fantasy";
	}
	if (/(apocalypse|wasteland|survival|mutant|ruin|fallout)/.test(text)) {
		return "post-apocalyptic";
	}
	if (/(horror|eldritch|gothic|nightmare|haunted|occult)/.test(text)) {
		return "horror";
	}
	if (/(modern|urban|detective|crime|contemporary)/.test(text)) {
		return "modern";
	}
	return "other";
}

function isInformativeText(raw: string): boolean {
	const normalized = raw.trim().toLowerCase();
	if (!normalized) return false;
	if (normalized.length < 80) return false;
	if (
		normalized.includes("todo") ||
		normalized.includes("tbd") ||
		normalized.includes("placeholder") ||
		normalized === "what this file is for"
	) {
		return false;
	}
	return true;
}

function inferLocationSlug(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, "")
			.trim()
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-") || "starting-area"
	);
}

function toDisplayName(slugOrText: string): string {
	return slugOrText
		.replace(/-/g, " ")
		.replace(/\b\w/g, (m) => m.toUpperCase())
		.trim();
}

function randomChoice<T>(values: T[]): T | null {
	if (values.length === 0) return null;
	const index = Math.floor(Math.random() * values.length);
	return values[index] ?? null;
}

function dedupeLocationCandidates(
	candidates: LocationCandidate[],
): LocationCandidate[] {
	const bySlug = new Map<string, LocationCandidate>();
	for (const candidate of candidates) {
		if (!candidate.slug || !candidate.name) continue;
		if (!bySlug.has(candidate.slug)) {
			bySlug.set(candidate.slug, candidate);
		}
	}
	return [...bySlug.values()];
}

function wildernessLocationName(theme: string | null): string {
	if (!theme) return "Middle of Nowhere";
	const category = inferThemeCategory(theme);
	switch (category) {
		case "sci-fi":
			return "Uncharted Drift";
		case "post-apocalyptic":
			return "Open Wasteland";
		case "horror":
			return "Forgotten Outskirts";
		case "modern":
			return "Edge of the District";
		case "fantasy":
			return "Wild Frontier";
		default:
			return "Middle of Nowhere";
	}
}

function locationCandidatesFromMapData(
	mapData: Record<string, unknown>,
): LocationCandidate[] {
	const rawLocations = Array.isArray(mapData.locations)
		? mapData.locations
		: [];
	const candidates: LocationCandidate[] = [];
	for (const rawLocation of rawLocations) {
		if (typeof rawLocation !== "object" || rawLocation === null) continue;
		const locationRecord = rawLocation as Record<string, unknown>;
		const name =
			typeof locationRecord.name === "string" && locationRecord.name.trim()
				? locationRecord.name.trim()
				: null;
		const slugFromId =
			typeof locationRecord.id === "string" && locationRecord.id.trim()
				? inferLocationSlug(locationRecord.id.trim())
				: null;
		if (!name && !slugFromId) continue;
		const slug = slugFromId ?? inferLocationSlug(name ?? "unknown-location");
		const resolvedName = name ?? toDisplayName(slug);
		candidates.push({ slug, name: resolvedName });
	}
	return dedupeLocationCandidates(candidates);
}

function chooseRandomSpawn(
	theme: string | null,
	workspaceCandidates: LocationCandidate[],
	mapCandidates: LocationCandidate[],
): SpawnSelection {
	const wildernessName = wildernessLocationName(theme);
	const wildernessSpawn: SpawnSelection = {
		slug: inferLocationSlug(wildernessName),
		name: wildernessName,
		origin: "wilderness",
	};

	const pool = [
		...mapCandidates.map((location) => ({
			...location,
			origin: "map" as const,
		})),
		...workspaceCandidates.map((location) => ({
			...location,
			origin: "workspace" as const,
		})),
	];

	if (pool.length === 0) {
		return wildernessSpawn;
	}

	// Keep a meaningful chance of wilderness starts even when map locations exist.
	if (Math.random() < 0.25) {
		return wildernessSpawn;
	}

	return randomChoice(pool) ?? wildernessSpawn;
}

function applySpawnToScene(scene: string, spawn: SpawnSelection): string {
	const lead =
		spawn.origin === "wilderness"
			? `You begin in the middle of nowhere near ${spawn.name}.`
			: `You begin at ${spawn.name}.`;
	return `${lead}\n\n${scene.trim()}`;
}

function normalizeSavedDiceRoller(value: unknown): DiceRoller | null {
	if (value === "player" || value === "bardo") {
		return value;
	}
	return null;
}

function normalizeSavedOptionalSystems(value: unknown): OptionalSystems {
	if (typeof value !== "object" || value === null) {
		return { ...defaultOptionalSystems };
	}
	const record = value as Record<string, unknown>;
	return {
		npcs:
			typeof record.npcs === "boolean"
				? record.npcs
				: defaultOptionalSystems.npcs,
		quests:
			typeof record.quests === "boolean"
				? record.quests
				: defaultOptionalSystems.quests,
		items:
			typeof record.items === "boolean"
				? record.items
				: defaultOptionalSystems.items,
		worldGeneration:
			typeof record.worldGeneration === "boolean"
				? record.worldGeneration
				: defaultOptionalSystems.worldGeneration,
	};
}

function mergeOptionalSystems(
	base: OptionalSystems,
	override: Partial<OptionalSystems> | undefined,
): OptionalSystems {
	if (!override) return { ...base };
	return {
		npcs: override.npcs ?? base.npcs,
		quests: override.quests ?? base.quests,
		items: override.items ?? base.items,
		worldGeneration: override.worldGeneration ?? base.worldGeneration,
	};
}

async function listMarkdownFilesRecursive(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			const nested = await listMarkdownFilesRecursive(fullPath);
			files.push(...nested);
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
			files.push(fullPath);
		}
	}

	return files;
}

async function listLocationCandidates(
	bardoRoot: string,
): Promise<LocationCandidate[]> {
	const locationsDir = resolvePathInsideRoot(bardoRoot, "world/locations");
	try {
		const entries = await readdir(locationsDir, { withFileTypes: true });
		const candidates: LocationCandidate[] = [];
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
				continue;
			}
			const slug = entry.name.replace(/\.md$/i, "");
			const filePath = resolvePathInsideRoot(
				bardoRoot,
				`world/locations/${entry.name}`,
			);
			const raw = await readTextIfExists(filePath);
			if (raw === null) continue;
			const parsed = parseMarkdown(raw);
			const name = parsed.frontmatter.title?.trim() || toDisplayName(slug);
			candidates.push({ slug, name });
		}
		return dedupeLocationCandidates(candidates);
	} catch {
		return [];
	}
}

async function readMapLocationCandidates(
	mapPath: string,
): Promise<LocationCandidate[]> {
	const raw = await readTextIfExists(mapPath);
	if (raw === null) return [];
	const parsed = parseMarkdown(raw);
	const mapData = parseJsonObject(parsed.content.trim());
	if (!mapData) return [];
	return locationCandidatesFromMapData(mapData);
}

function getTopLevelDir(relativePath: string): string {
	const normalized = relativePath.replaceAll("\\", "/");
	const first = normalized.split("/")[0];
	return first || "unknown";
}

async function analyzeWorkspace(
	bardoRoot: string,
): Promise<{ summary: WorkspaceSummary; hint: WorkspaceHint }> {
	const informativeByDirectory: Record<string, number> = {};
	for (const directory of BARDO_SUBDIRECTORIES) {
		informativeByDirectory[directory] = 0;
	}

	const hint: WorkspaceHint = {
		firstLocationName: null,
		firstLocationSlug: null,
		firstQuestTitle: null,
		firstPartyTitle: null,
	};

	let markdownFiles = 0;
	let informativeFiles = 0;
	let totalContentChars = 0;
	let worldLocationFiles = 0;
	let worldInformativeFiles = 0;

	const markdownPaths = await listMarkdownFilesRecursive(bardoRoot);
	for (const absolutePath of markdownPaths) {
		const relativePath = path
			.relative(bardoRoot, absolutePath)
			.replaceAll("\\", "/");
		const topLevel = getTopLevelDir(relativePath);
		const raw = await readTextIfExists(absolutePath);
		if (raw === null) continue;

		const parsed = parseMarkdown(raw);
		const body = parsed.content.trim();
		const combined = `${parsed.frontmatter.title ?? ""}\n${body}`;
		const informative = isInformativeText(combined);

		markdownFiles += 1;
		totalContentChars += body.length;

		if (relativePath.startsWith("world/locations/")) {
			worldLocationFiles += 1;
		}

		if (informative) {
			informativeFiles += 1;
			if (topLevel in informativeByDirectory) {
				informativeByDirectory[topLevel] =
					(informativeByDirectory[topLevel] ?? 0) + 1;
			}
			if (topLevel === "world") {
				worldInformativeFiles += 1;
			}
		}

		if (
			hint.firstLocationName === null &&
			relativePath.startsWith("world/locations/") &&
			(parsed.frontmatter.title?.trim() || path.basename(relativePath, ".md"))
		) {
			const locationName =
				parsed.frontmatter.title?.trim() ?? path.basename(relativePath, ".md");
			hint.firstLocationName = locationName;
			hint.firstLocationSlug = inferLocationSlug(locationName);
		}

		if (
			hint.firstQuestTitle === null &&
			relativePath.startsWith("quests/") &&
			parsed.frontmatter.title?.trim()
		) {
			hint.firstQuestTitle = parsed.frontmatter.title.trim();
		}

		if (
			hint.firstPartyTitle === null &&
			relativePath.startsWith("party/") &&
			parsed.frontmatter.title?.trim()
		) {
			hint.firstPartyTitle = parsed.frontmatter.title.trim();
		}
	}

	const looksSufficientForAutoScene =
		(worldLocationFiles > 0 || worldInformativeFiles > 0) &&
		totalContentChars >= 120 &&
		informativeFiles > 0;

	return {
		summary: {
			markdownFiles,
			informativeFiles,
			totalContentChars,
			informativeByDirectory,
			looksSufficientForAutoScene,
			worldLocationFiles,
			worldInformativeFiles,
			workspaceEmpty: markdownFiles === 0,
		},
		hint,
	};
}

async function readJsonMarkdown(filePath: string): Promise<{
	frontmatter: Record<string, string>;
	data: Record<string, unknown>;
}> {
	const raw = await readTextIfExists(filePath);
	if (raw === null) {
		return { frontmatter: {}, data: {} };
	}

	const parsed = parseMarkdown(raw);
	const data = parseJsonObject(parsed.content.trim()) ?? {};
	return { frontmatter: parsed.frontmatter, data };
}

async function ensureLocationMarkdownFile(
	bardoRoot: string,
	locationSlug: string,
	locationName: string,
): Promise<void> {
	const filePath = resolvePathInsideRoot(
		bardoRoot,
		`world/locations/${locationSlug}.md`,
	);
	const raw = await readTextIfExists(filePath);
	if (raw !== null) {
		return;
	}

	const payload = {
		id: locationSlug,
		name: locationName,
		discoveryStatus: "known",
		tags: ["location", "starting-point"],
		notes: "Starting location initialized by campaign setup.",
	};

	await ensureParentDirectoryExists(filePath);
	await writeFile(
		filePath,
		renderMarkdown(
			{
				description: "Location or point of interest",
				title: locationName,
			},
			JSON.stringify(payload, null, 2),
		),
		"utf8",
	);
}

function buildWorkspaceBasedScene(
	hint: WorkspaceHint,
	theme: string | null,
): { sceneText: string; locationName: string; locationSlug: string } {
	const locationName = hint.firstLocationName ?? "the nearest settlement";
	const locationSlug =
		hint.firstLocationSlug ?? inferLocationSlug(locationName);
	const themeLine = theme
		? `The tone of this world is ${theme}, and every detail around you reinforces it.`
		: "The world reveals itself through details that invite curiosity and caution.";
	const partyLine = hint.firstPartyTitle
		? `Your party (${hint.firstPartyTitle}) approaches ${locationName}.`
		: `You approach ${locationName}.`;
	const questLine = hint.firstQuestTitle
		? `Rumors about ${hint.firstQuestTitle} are already influencing local behavior.`
		: "Several potential leads compete for your attention as you arrive.";

	return {
		sceneText: `${partyLine}\n${themeLine}\n${questLine}\n\nWhat do you do first?`,
		locationName,
		locationSlug,
	};
}

function generateProceduralMap(theme: string): ProceduralMapResult {
	const category = inferThemeCategory(theme);
	const generatedAtISO = new Date().toISOString();

	if (category === "sci-fi") {
		const startingLocationName = "Orion Transfer Dock";
		const startingLocationSlug = inferLocationSlug(startingLocationName);
		const mapData: Record<string, unknown> = {
			id: "primary-map",
			theme,
			category,
			mapType: "galaxy-map",
			scale: "stellar",
			generatedAtISO,
			regions: [
				{
					id: "orion-arm",
					name: "Orion Arm",
					kind: "sector",
					center: { x: 0, y: 0, z: 0 },
				},
				{
					id: "perseus-reach",
					name: "Perseus Reach",
					kind: "sector",
					center: { x: 62, y: 18, z: -7 },
				},
				{
					id: "veil-expanse",
					name: "Veil Expanse",
					kind: "sector",
					center: { x: -44, y: 27, z: 13 },
				},
			],
			biomes: ["nebula", "asteroid-field", "void", "ringed-gas-giant-orbit"],
			locations: [
				{
					id: "orion-transfer-dock",
					name: startingLocationName,
					type: "station",
					coordinates: { x: 3, y: -2, z: 0 },
				},
				{
					id: "khepri-ix",
					name: "Khepri IX",
					type: "planet",
					coordinates: { x: 21, y: 8, z: -1 },
				},
				{
					id: "glass-belt",
					name: "Glass Belt",
					type: "asteroid-belt",
					coordinates: { x: -11, y: 15, z: 4 },
				},
				{
					id: "janus-gate",
					name: "Janus Gate",
					type: "jumpgate",
					coordinates: { x: 45, y: -9, z: 12 },
				},
			],
			pointsOfInterest: [
				"derelict survey ship",
				"pirate relay beacon",
				"corporate black-site habitat",
				"anomalous gravity well",
			],
			worldElements: [
				"factions",
				"trade-lanes",
				"jump-routes",
				"hidden outposts",
				"restricted sectors",
			],
		};

		return {
			sceneText:
				"You dock at Orion Transfer Dock, a crowded hub where traders, mercenaries, and fugitives overlap.\nCargo sirens pulse through the hull while three leads appear at once: a missing freighter ping, a bounty contract, and a smuggler contact waiting in bay C.\n\nWhat do you do first?",
			startingLocationName,
			startingLocationSlug,
			mapData,
		};
	}

	if (category === "post-apocalyptic") {
		const startingLocationName = "Dustline Refuge";
		const startingLocationSlug = inferLocationSlug(startingLocationName);
		const mapData: Record<string, unknown> = {
			id: "primary-map",
			theme,
			category,
			mapType: "wasteland-map",
			scale: "regional",
			generatedAtISO,
			regions: [
				{
					id: "ash-plains",
					name: "Ash Plains",
					kind: "wasteland",
					center: { x: 0, y: 0, z: 0 },
				},
				{
					id: "broken-ridge",
					name: "Broken Ridge",
					kind: "mountain-ruins",
					center: { x: 33, y: -12, z: 4 },
				},
				{
					id: "flood-sink",
					name: "Flood Sink",
					kind: "toxic-swamp",
					center: { x: -26, y: 17, z: -2 },
				},
			],
			biomes: [
				"ruined-city",
				"toxic-swamp",
				"dust-desert",
				"collapsed-tunnel-network",
			],
			locations: [
				{
					id: "dustline-refuge",
					name: startingLocationName,
					type: "camp",
					coordinates: { x: 2, y: 4, z: 0 },
				},
				{
					id: "relay-13",
					name: "Relay 13",
					type: "signal-tower",
					coordinates: { x: 14, y: -8, z: 1 },
				},
				{
					id: "sunken-arcology",
					name: "Sunken Arcology",
					type: "dungeon",
					coordinates: { x: -19, y: 11, z: -3 },
				},
			],
			pointsOfInterest: [
				"clean-water vault",
				"raider checkpoint",
				"abandoned bunker",
				"mutant nest",
			],
			worldElements: [
				"factions",
				"scarcity zones",
				"storm fronts",
				"radiation pockets",
				"secret shelters",
			],
		};

		return {
			sceneText:
				"You arrive at Dustline Refuge as a sandstorm builds on the horizon.\nSupplies are low, tempers are high, and a scout just reported movement near Relay 13.\n\nWhat do you do first?",
			startingLocationName,
			startingLocationSlug,
			mapData,
		};
	}

	if (category === "horror") {
		const startingLocationName = "Blackwater Hamlet";
		const startingLocationSlug = inferLocationSlug(startingLocationName);
		const mapData: Record<string, unknown> = {
			id: "primary-map",
			theme,
			category,
			mapType: "region-map",
			scale: "local",
			generatedAtISO,
			regions: [
				{
					id: "mourning-wood",
					name: "Mourning Wood",
					kind: "forest",
					center: { x: 0, y: 0, z: 0 },
				},
				{
					id: "hollow-marsh",
					name: "Hollow Marsh",
					kind: "swamp",
					center: { x: -12, y: 9, z: -1 },
				},
			],
			biomes: [
				"fog-marsh",
				"old-growth-forest",
				"ruined-manor-grounds",
				"caverns",
			],
			locations: [
				{
					id: "blackwater-hamlet",
					name: startingLocationName,
					type: "village",
					coordinates: { x: 1, y: -1, z: 0 },
				},
				{
					id: "glass-chapel",
					name: "Glass Chapel",
					type: "point-of-interest",
					coordinates: { x: 8, y: 3, z: 0 },
				},
				{
					id: "weeping-mine",
					name: "Weeping Mine",
					type: "dungeon",
					coordinates: { x: -7, y: -6, z: -4 },
				},
			],
			pointsOfInterest: [
				"sealed crypt",
				"ritual circle",
				"missing-person trail",
				"forbidden archive",
			],
			worldElements: [
				"omens",
				"night phases",
				"corruption zones",
				"secret cult cells",
				"haunted landmarks",
			],
		};

		return {
			sceneText:
				"Night settles over Blackwater Hamlet as church bells ring without a visible bell-ringer.\nVillagers avoid eye contact, and someone leaves a warning carved into your inn door.\n\nWhat do you do first?",
			startingLocationName,
			startingLocationSlug,
			mapData,
		};
	}

	const fantasyLike = category === "fantasy" || category === "other";
	if (fantasyLike) {
		const startingLocationName =
			category === "fantasy" ? "Oakrest Village" : "Harbor Crossroads";
		const startingLocationSlug = inferLocationSlug(startingLocationName);
		const mapData: Record<string, unknown> = {
			id: "primary-map",
			theme,
			category,
			mapType: "world-map",
			scale: "regional",
			generatedAtISO,
			regions: [
				{
					id: "crownvale",
					name: "Crownvale",
					kind: "kingdom",
					center: { x: 0, y: 0, z: 0 },
				},
				{
					id: "stormreach",
					name: "Stormreach",
					kind: "mountain-range",
					center: { x: 28, y: -11, z: 6 },
				},
				{
					id: "mirewild",
					name: "Mirewild",
					kind: "swamp-forest",
					center: { x: -23, y: 14, z: -2 },
				},
			],
			biomes: ["forest", "valley", "mountains", "swamp", "coastline", "tundra"],
			locations: [
				{
					id: inferLocationSlug(startingLocationName),
					name: startingLocationName,
					type: "village",
					coordinates: { x: 3, y: 2, z: 0 },
				},
				{
					id: "whispering-canyon",
					name: "Whispering Canyon",
					type: "point-of-interest",
					coordinates: { x: 17, y: -4, z: -1 },
				},
				{
					id: "sunken-keep",
					name: "Sunken Keep",
					type: "dungeon",
					coordinates: { x: -14, y: 9, z: -3 },
				},
				{
					id: "isle-of-cinders",
					name: "Isle of Cinders",
					type: "island",
					coordinates: { x: 41, y: 16, z: 0 },
				},
			],
			pointsOfInterest: [
				"ancient shrine",
				"bandit camp",
				"merchant outpost",
				"secret cavern",
			],
			worldElements: [
				"kingdom borders",
				"faction territories",
				"roads and rivers",
				"camps and ruins",
				"secret locations",
			],
		};

		return {
			sceneText:
				`You arrive at ${startingLocationName}, where rumors spread faster than coin changes hands.\n` +
				"Three immediate leads stand out: a local dispute, a dangerous landmark nearby, and whispers of an older threat waking beneath the land.\n\nWhat do you do first?",
			startingLocationName,
			startingLocationSlug,
			mapData,
		};
	}

	const startingLocationName = "Central District";
	const startingLocationSlug = inferLocationSlug(startingLocationName);
	const mapData: Record<string, unknown> = {
		id: "primary-map",
		theme,
		category: "modern",
		mapType: "city-map",
		scale: "urban",
		generatedAtISO,
		regions: [
			{
				id: "old-quarter",
				name: "Old Quarter",
				kind: "district",
				center: { x: 0, y: 0, z: 0 },
			},
			{
				id: "riverfront",
				name: "Riverfront",
				kind: "district",
				center: { x: 9, y: -4, z: 0 },
			},
		],
		biomes: ["urban", "industrial", "riverway", "underground network"],
		locations: [
			{
				id: "central-district",
				name: startingLocationName,
				type: "district",
				coordinates: { x: 2, y: 2, z: 0 },
			},
			{
				id: "north-station",
				name: "North Station",
				type: "point-of-interest",
				coordinates: { x: -5, y: 7, z: 0 },
			},
			{
				id: "vault-9",
				name: "Vault 9",
				type: "secret-location",
				coordinates: { x: 4, y: -9, z: -2 },
			},
		],
		pointsOfInterest: [
			"black market",
			"police archive",
			"abandoned subway line",
			"rooftop safehouse",
		],
		worldElements: [
			"district control",
			"faction influence",
			"intel routes",
			"hidden caches",
			"restricted zones",
		],
	};

	return {
		sceneText:
			"You step into Central District as traffic, rumors, and faction pressure collide.\nA contact is late, a new threat is moving through the city, and your window to act is short.\n\nWhat do you do first?",
		startingLocationName,
		startingLocationSlug,
		mapData,
	};
}

const diceRollerSchema = z
	.enum(["player", "bardo"])
	.describe("Who rolls party character dice: `player` or `bardo`.");

const optionalSystemsInputSchema = z
	.object({
		npcs: z
			.boolean()
			.optional()
			.describe("Enable or disable NPC-related gameplay generation."),
		quests: z
			.boolean()
			.optional()
			.describe("Enable or disable quest-related gameplay generation."),
		items: z
			.boolean()
			.optional()
			.describe("Enable or disable item/loot-related gameplay generation."),
		worldGeneration: z
			.boolean()
			.optional()
			.describe("Enable or disable automatic world expansion behavior."),
	})
	.partial()
	.describe(
		"Optional non-core gameplay systems. Core setup and state tools are always active and cannot be disabled.",
	);

const optionalSystemsOutputSchema = z.object({
	npcs: z.boolean(),
	quests: z.boolean(),
	items: z.boolean(),
	worldGeneration: z.boolean(),
});

const initInputSchema = z
	.object({
		diceRoller: diceRollerSchema
			.optional()
			.describe(
				"Required once per campaign. If missing and no saved value exists, the assistant must ask the user to pick `player` or `bardo`.",
			),
		theme: z
			.string()
			.trim()
			.min(2)
			.max(120)
			.optional()
			.describe(
				"Game theme/category (for example: `dark fantasy`, `space opera`, `post-apocalyptic survival`). Used to guide world generation and future behavior.",
			),
		optionalSystems: optionalSystemsInputSchema.optional(),
		startingScene: z
			.string()
			.trim()
			.min(1)
			.max(8_000)
			.optional()
			.describe(
				"Optional opening scene text. If omitted, init uses workspace world content first; if none exists, it generates a scene from theme-aware procedural map data.",
			),
	})
	.strict();

const directoryReportSchema = z.object({
	name: z.string().describe("Directory logical name"),
	path: z.string().describe("Absolute filesystem path"),
	existedBefore: z
		.boolean()
		.describe("Whether the path existed before this tool call"),
	createdNow: z.boolean().describe("Whether this call created the directory"),
	isDirectory: z
		.boolean()
		.describe("Whether the path is currently a directory"),
});

const workspaceSummarySchema = z.object({
	markdownFiles: z.number().int().nonnegative(),
	informativeFiles: z.number().int().nonnegative(),
	totalContentChars: z.number().int().nonnegative(),
	informativeByDirectory: z.record(z.string(), z.number().int().nonnegative()),
	looksSufficientForAutoScene: z.boolean(),
	worldLocationFiles: z.number().int().nonnegative(),
	worldInformativeFiles: z.number().int().nonnegative(),
	workspaceEmpty: z.boolean(),
});

const initOutputSchema = z.object({
	success: z.boolean().describe("True when initialization operation completed"),
	setupComplete: z
		.boolean()
		.describe(
			"True only when workspace exists, dice roller preference is saved, and a starting scene is ready.",
		),
	requiresUserInput: z
		.boolean()
		.describe(
			"True when the assistant should ask the user for missing setup details",
		),
	message: z.string().describe("Human-readable summary"),
	nextPrompts: z
		.array(z.string())
		.describe("Direct prompts the assistant should ask the user next"),
	rootPath: z.string().describe("Absolute bardo root path"),
	rootExistedBefore: z
		.boolean()
		.describe("Whether the bardo root already existed before this call"),
	createdDirectories: z
		.array(z.string())
		.describe("Absolute paths created during this call"),
	existingDirectories: z
		.array(z.string())
		.describe("Absolute paths that already existed as directories"),
	directories: z
		.array(directoryReportSchema)
		.describe(
			"Per-directory status report including root and all subdirectories",
		),
	diceRoller: z
		.union([diceRollerSchema, z.null()])
		.describe("Saved dice roller preference or null when still missing"),
	theme: z
		.union([z.string(), z.null()])
		.describe("Saved theme/category preference or null when missing"),
	optionalSystems: optionalSystemsOutputSchema.describe(
		"Resolved non-core system toggles for this campaign",
	),
	settingsPath: z
		.string()
		.describe("Absolute path of saved setup settings markdown"),
	legacySettingsPath: z
		.string()
		.describe("Legacy settings path checked for backward compatibility"),
	legacySettingsDetected: z
		.boolean()
		.describe("True when legacy `state/settings.md` was detected"),
	startingScenePath: z
		.string()
		.describe("Absolute path for the starting scene markdown file"),
	mapPath: z
		.string()
		.describe("Absolute path of generated or reusable map markdown"),
	mapGenerated: z
		.boolean()
		.describe("True when init generated map content this run"),
	startingSceneSource: z
		.enum([
			"user_provided",
			"generated_from_workspace",
			"generated_from_theme_map",
			"existing_scene_reused",
			"not_available",
		])
		.describe("How starting scene content was resolved"),
	startingScenePreview: z
		.string()
		.describe("Short preview of the active starting scene content"),
	spawnLocationSlug: z
		.string()
		.optional()
		.describe("Spawn location slug selected during setup"),
	spawnLocationName: z
		.string()
		.optional()
		.describe("Spawn location display name selected during setup"),
	spawnOrigin: z
		.enum(["workspace", "map", "wilderness", "existing_state"])
		.optional()
		.describe("Where the selected spawn came from"),
	workspaceSummary: workspaceSummarySchema.describe(
		"Signal used to decide whether auto-generating a scene is safe",
	),
	statePath: z.string().describe("Absolute path to campaign state markdown"),
	historyPath: z
		.string()
		.describe("Absolute path to campaign history markdown"),
});

type DirectoryReport = z.infer<typeof directoryReportSchema>;
type InitOutput = z.infer<typeof initOutputSchema>;

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
			const settingsPath = resolvePathInsideRoot(
				bardoRoot,
				"_settings/settings.md",
			);
			const legacySettingsPath = resolvePathInsideRoot(
				bardoRoot,
				"state/settings.md",
			);
			const scenePath = resolvePathInsideRoot(
				bardoRoot,
				"world/scenes/starting-scene.md",
			);
			const mapPath = resolvePathInsideRoot(
				bardoRoot,
				"world/maps/primary-map.md",
			);
			const statePath = resolvePathInsideRoot(bardoRoot, "state/current.md");
			const historyPath = resolvePathInsideRoot(bardoRoot, "state/history.md");
			const directories: DirectoryReport[] = [];
			const createdDirectories: string[] = [];
			const existingDirectories: string[] = [];
			const nextPrompts: string[] = [];

			const rootStatus = await inspectPath(bardoRoot);
			if (rootStatus.exists && !rootStatus.isDirectory) {
				const output: InitOutput = {
					success: false,
					setupComplete: false,
					requiresUserInput: false,
					message:
						"Initialization failed: `bardo` exists but is not a directory.",
					nextPrompts,
					rootPath: bardoRoot,
					rootExistedBefore: true,
					createdDirectories,
					existingDirectories,
					directories: [
						{
							name: "bardo",
							path: bardoRoot,
							existedBefore: true,
							createdNow: false,
							isDirectory: false,
						},
					],
					diceRoller: null,
					theme: null,
					optionalSystems: { ...defaultOptionalSystems },
					settingsPath,
					legacySettingsPath,
					legacySettingsDetected: false,
					startingScenePath: scenePath,
					mapPath,
					mapGenerated: false,
					startingSceneSource: "not_available",
					startingScenePreview: "",
					workspaceSummary: {
						markdownFiles: 0,
						informativeFiles: 0,
						totalContentChars: 0,
						informativeByDirectory: {},
						looksSufficientForAutoScene: false,
						worldLocationFiles: 0,
						worldInformativeFiles: 0,
						workspaceEmpty: true,
					},
					statePath,
					historyPath,
				};
				return makeToolResult(output, true);
			}

			let rootCreatedNow = false;
			if (!rootStatus.exists) {
				await mkdir(bardoRoot, { recursive: true });
				rootCreatedNow = true;
				createdDirectories.push(bardoRoot);
			} else {
				existingDirectories.push(bardoRoot);
			}

			directories.push({
				name: "bardo",
				path: bardoRoot,
				existedBefore: rootStatus.exists,
				createdNow: rootCreatedNow,
				isDirectory: true,
			});

			for (const dir of BARDO_SUBDIRECTORIES) {
				const fullPath = path.join(bardoRoot, dir);
				const dirStatus = await inspectPath(fullPath);

				if (dirStatus.exists && !dirStatus.isDirectory) {
					directories.push({
						name: dir,
						path: fullPath,
						existedBefore: true,
						createdNow: false,
						isDirectory: false,
					});

					const output: InitOutput = {
						success: false,
						setupComplete: false,
						requiresUserInput: false,
						message: `Initialization failed: \`${dir}\` exists but is not a directory.`,
						nextPrompts,
						rootPath: bardoRoot,
						rootExistedBefore: rootStatus.exists,
						createdDirectories,
						existingDirectories,
						directories,
						diceRoller: null,
						theme: null,
						optionalSystems: { ...defaultOptionalSystems },
						settingsPath,
						legacySettingsPath,
						legacySettingsDetected: false,
						startingScenePath: scenePath,
						mapPath,
						mapGenerated: false,
						startingSceneSource: "not_available",
						startingScenePreview: "",
						workspaceSummary: {
							markdownFiles: 0,
							informativeFiles: 0,
							totalContentChars: 0,
							informativeByDirectory: {},
							looksSufficientForAutoScene: false,
							worldLocationFiles: 0,
							worldInformativeFiles: 0,
							workspaceEmpty: true,
						},
						statePath,
						historyPath,
					};
					return makeToolResult(output, true);
				}

				let createdNow = false;
				if (!dirStatus.exists) {
					await mkdir(fullPath, { recursive: true });
					createdNow = true;
					createdDirectories.push(fullPath);
				} else {
					existingDirectories.push(fullPath);
				}

				directories.push({
					name: dir,
					path: fullPath,
					existedBefore: dirStatus.exists,
					createdNow,
					isDirectory: true,
				});
			}

			const { summary, hint } = await analyzeWorkspace(bardoRoot);

			const settings = await readJsonMarkdown(settingsPath);
			const legacySettings = await readJsonMarkdown(legacySettingsPath);
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

			const existingSceneRaw = await readTextIfExists(scenePath);
			const existingSceneContent = existingSceneRaw
				? parseMarkdown(existingSceneRaw).content.trim()
				: "";
			const workspaceLocationCandidates =
				await listLocationCandidates(bardoRoot);
			const existingMapCandidates = await readMapLocationCandidates(mapPath);

			let startingSceneContent = "";
			let startingSceneSource: InitOutput["startingSceneSource"] =
				"not_available";
			let shouldPersistScene = false;
			let mapGenerated = false;
			let spawnSelection: SpawnSelection | null = null;
			let mapCandidatesForSpawn: LocationCandidate[] = existingMapCandidates;
			let startingLocationName = hint.firstLocationName ?? "Starting Area";
			let startingLocationSlug =
				hint.firstLocationSlug ?? inferLocationSlug(startingLocationName);

			if (typeof startingScene === "string" && startingScene.trim()) {
				startingSceneContent = startingScene.trim();
				startingSceneSource = "user_provided";
				shouldPersistScene = true;
			} else if (existingSceneContent) {
				startingSceneContent = existingSceneContent;
				startingSceneSource = "existing_scene_reused";
				const currentState = await readJsonMarkdown(statePath);
				const stateData = currentState.data;
				if (typeof stateData.currentLocation === "string") {
					startingLocationSlug = inferLocationSlug(stateData.currentLocation);
					const stateLocations =
						typeof stateData.locations === "object" &&
						stateData.locations !== null
							? (stateData.locations as Record<string, unknown>)
							: {};
					const maybeLocation = stateLocations[startingLocationSlug];
					if (typeof maybeLocation === "object" && maybeLocation !== null) {
						const locationRecord = maybeLocation as Record<string, unknown>;
						startingLocationName =
							typeof locationRecord.name === "string" &&
							locationRecord.name.trim()
								? locationRecord.name.trim()
								: toDisplayName(startingLocationSlug);
					} else {
						startingLocationName = toDisplayName(startingLocationSlug);
					}
				}
				spawnSelection = {
					slug: startingLocationSlug,
					name: startingLocationName,
					origin: "existing_state",
				};
			} else if (
				summary.worldLocationFiles > 0 ||
				summary.worldInformativeFiles > 0
			) {
				const derived = buildWorkspaceBasedScene(hint, resolvedTheme);
				startingSceneContent = derived.sceneText;
				startingSceneSource = "generated_from_workspace";
				shouldPersistScene = true;
				startingLocationName = derived.locationName;
				startingLocationSlug = derived.locationSlug;
			} else {
				if (!resolvedTheme) {
					nextPrompts.push(
						"What game theme/category are you playing (for example: fantasy, sci-fi, post-apocalyptic, horror)? I need this to generate a coherent world map and starting scene.",
					);
				} else {
					const generated = generateProceduralMap(resolvedTheme);
					startingSceneContent = generated.sceneText;
					startingSceneSource = "generated_from_theme_map";
					shouldPersistScene = true;
					mapGenerated = true;
					startingLocationName = generated.startingLocationName;
					startingLocationSlug = generated.startingLocationSlug;
					mapCandidatesForSpawn = locationCandidatesFromMapData(
						generated.mapData,
					);

					await ensureParentDirectoryExists(mapPath);
					await writeFile(
						mapPath,
						renderMarkdown(
							{
								description:
									"Primary world map and world elements generated from selected game theme",
								title: "Primary Map",
							},
							JSON.stringify(generated.mapData, null, 2),
						),
						"utf8",
					);

					for (const mapLocation of mapCandidatesForSpawn) {
						await ensureLocationMarkdownFile(
							bardoRoot,
							mapLocation.slug,
							mapLocation.name,
						);
					}
				}
			}

			if (
				!startingSceneContent &&
				!summary.workspaceEmpty &&
				summary.informativeFiles === 0
			) {
				nextPrompts.push(
					"Your workspace has files but content is too vague to start safely. Add clearer world/party/rules details or provide a direct starting scene.",
				);
			}

			if (shouldPersistScene) {
				spawnSelection = chooseRandomSpawn(
					resolvedTheme,
					workspaceLocationCandidates,
					mapCandidatesForSpawn,
				);
				startingLocationName = spawnSelection.name;
				startingLocationSlug = spawnSelection.slug;
				startingSceneContent = applySpawnToScene(
					startingSceneContent,
					spawnSelection,
				);
				await ensureParentDirectoryExists(scenePath);
				await writeFile(
					scenePath,
					renderMarkdown(
						{
							description: "Opening scene used to start the campaign",
							title: "Starting Scene",
						},
						startingSceneContent,
					),
					"utf8",
				);
			}

			const nowIso = new Date().toISOString();
			const nextSettings = {
				diceRoller: resolvedDiceRoller ?? null,
				theme: resolvedTheme ?? null,
				optionalSystems: resolvedOptionalSystems,
				startingScenePath: "world/scenes/starting-scene.md",
				mapPath: "world/maps/primary-map.md",
				lastSpawn: spawnSelection
					? {
							slug: spawnSelection.slug,
							name: spawnSelection.name,
							origin: spawnSelection.origin,
						}
					: null,
				updatedAtISO: nowIso,
			};
			await ensureParentDirectoryExists(settingsPath);
			await writeFile(
				settingsPath,
				renderMarkdown(
					{
						description:
							"Campaign setup settings and preferences (authoritative location)",
						title: "Campaign Settings",
					},
					JSON.stringify(nextSettings, null, 2),
				),
				"utf8",
			);

			if (startingSceneContent) {
				await ensureLocationMarkdownFile(
					bardoRoot,
					startingLocationSlug,
					startingLocationName,
				);

				const currentState = await readJsonMarkdown(statePath);
				const stateData = currentState.data;

				const counters =
					typeof stateData.counters === "object" && stateData.counters !== null
						? (stateData.counters as Record<string, unknown>)
						: {};
				const locations =
					typeof stateData.locations === "object" &&
					stateData.locations !== null
						? (stateData.locations as Record<string, unknown>)
						: {};

				if (!(startingLocationSlug in locations)) {
					locations[startingLocationSlug] = {
						name: startingLocationName,
						visits: 0,
						npcIds: [],
					};
				}

				const nextState = {
					worldTimeISO:
						typeof stateData.worldTimeISO === "string"
							? stateData.worldTimeISO
							: nowIso,
					currentLocation:
						typeof stateData.currentLocation === "string"
							? stateData.currentLocation
							: startingLocationSlug,
					counters: {
						unknownNpc:
							typeof counters.unknownNpc === "number" ? counters.unknownNpc : 0,
						unknownLocation:
							typeof counters.unknownLocation === "number"
								? counters.unknownLocation
								: 0,
					},
					locations,
					lastAction: "campaign_initialized",
				};

				await ensureParentDirectoryExists(statePath);
				await writeFile(
					statePath,
					renderMarkdown(
						{
							description: "Current campaign state and memory snapshot",
							title: "Campaign State",
						},
						JSON.stringify(nextState, null, 2),
					),
					"utf8",
				);

				const history = await readJsonMarkdown(historyPath);
				const existingHistoryRaw = await readTextIfExists(historyPath);
				const existingHistoryContent = existingHistoryRaw
					? parseMarkdown(existingHistoryRaw).content.trim()
					: "";
				const historyEntry =
					`${nowIso} | intent=setup | action="campaign init" | ` +
					`dice_roller=${resolvedDiceRoller ?? "unset"} | ` +
					`theme=${resolvedTheme ?? "unset"} | ` +
					`scene_source=${startingSceneSource}`;
				const nextHistoryContent = existingHistoryContent
					? `${existingHistoryContent}\n${historyEntry}`
					: historyEntry;

				await ensureParentDirectoryExists(historyPath);
				await writeFile(
					historyPath,
					renderMarkdown(
						{
							description:
								history.frontmatter.description ??
								"Chronological campaign action history log",
							title: history.frontmatter.title ?? "Campaign History",
						},
						nextHistoryContent,
					),
					"utf8",
				);
			}

			const setupComplete =
				Boolean(resolvedDiceRoller) && Boolean(startingSceneContent.trim());
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
				rootExistedBefore: rootStatus.exists,
				createdDirectories,
				existingDirectories,
				directories,
				diceRoller: resolvedDiceRoller ?? null,
				theme: resolvedTheme,
				optionalSystems: resolvedOptionalSystems,
				settingsPath,
				legacySettingsPath,
				legacySettingsDetected,
				startingScenePath: scenePath,
				mapPath,
				mapGenerated,
				startingSceneSource,
				startingScenePreview: startingSceneContent.slice(0, 240),
				spawnLocationSlug: spawnSelection?.slug,
				spawnLocationName: spawnSelection?.name,
				spawnOrigin: spawnSelection?.origin,
				workspaceSummary: summary,
				statePath,
				historyPath,
			};

			return makeToolResult(output);
		},
	);
}
