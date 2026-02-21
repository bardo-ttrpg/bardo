import { inferLocationSlug } from "../spawn";
import type { ProceduralMapResult } from "../types";

export function buildModernPreset(
	theme: string,
	generatedAtISO: string,
): ProceduralMapResult {
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
