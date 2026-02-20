import { inferLocationSlug } from "../spawn";
import type { ProceduralMapResult } from "../types";

export function buildHorrorPreset(
	theme: string,
	generatedAtISO: string,
): ProceduralMapResult {
	const startingLocationName = "Blackwater Hamlet";
	const startingLocationSlug = inferLocationSlug(startingLocationName);
	const mapData: Record<string, unknown> = {
		id: "primary-map",
		theme,
		category: "horror",
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
