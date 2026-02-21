import { inferLocationSlug } from "../spawn";
import type { ProceduralMapResult } from "../types";

export function buildSciFiPreset(
	theme: string,
	generatedAtISO: string,
): ProceduralMapResult {
	const startingLocationName = "Orion Transfer Dock";
	const startingLocationSlug = inferLocationSlug(startingLocationName);
	const mapData: Record<string, unknown> = {
		id: "primary-map",
		theme,
		category: "sci-fi",
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
