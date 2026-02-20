import { inferLocationSlug } from "../spawn";
import type { ProceduralMapResult } from "../types";

export function buildPostApocalypticPreset(
	theme: string,
	generatedAtISO: string,
): ProceduralMapResult {
	const startingLocationName = "Dustline Refuge";
	const startingLocationSlug = inferLocationSlug(startingLocationName);
	const mapData: Record<string, unknown> = {
		id: "primary-map",
		theme,
		category: "post-apocalyptic",
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
