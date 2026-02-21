import { inferLocationSlug } from "../spawn";
import type { ProceduralMapResult } from "../types";

export function buildFantasyLikePreset(
	theme: string,
	category: "fantasy" | "other",
	generatedAtISO: string,
): ProceduralMapResult {
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
