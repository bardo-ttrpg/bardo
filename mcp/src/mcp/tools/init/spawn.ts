import type { LocationCandidate, SpawnSelection, ThemeCategory } from "./types";

export function inferThemeCategory(theme: string): ThemeCategory {
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

export function isInformativeText(raw: string): boolean {
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

export function inferLocationSlug(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, "")
			.trim()
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-") || "starting-area"
	);
}

export function toDisplayName(slugOrText: string): string {
	return slugOrText
		.replace(/-/g, " ")
		.replace(/\b\w/g, (m) => m.toUpperCase())
		.trim();
}

export function randomChoice<T>(values: T[]): T | null {
	if (values.length === 0) return null;
	const index = Math.floor(Math.random() * values.length);
	return values[index] ?? null;
}

export function dedupeLocationCandidates(
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

export function wildernessLocationName(theme: string | null): string {
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

export function locationCandidatesFromMapData(
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

export function chooseRandomSpawn(
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

export function applySpawnToScene(
	scene: string,
	spawn: SpawnSelection,
): string {
	const lead =
		spawn.origin === "wilderness"
			? `You begin in the middle of nowhere near ${spawn.name}.`
			: `You begin at ${spawn.name}.`;
	return `${lead}\n\n${scene.trim()}`;
}
