import { buildFantasyLikePreset } from "./map-presets/fantasy-like";
import { buildHorrorPreset } from "./map-presets/horror";
import { buildModernPreset } from "./map-presets/modern";
import { buildPostApocalypticPreset } from "./map-presets/post-apocalyptic";
import { buildSciFiPreset } from "./map-presets/sci-fi";
import type { ProceduralMapResult, ThemeCategory } from "./types";

export function buildPresetForCategory(args: {
	category: ThemeCategory;
	theme: string;
	generatedAtISO: string;
}): ProceduralMapResult {
	switch (args.category) {
		case "sci-fi":
			return buildSciFiPreset(args.theme, args.generatedAtISO);
		case "post-apocalyptic":
			return buildPostApocalypticPreset(args.theme, args.generatedAtISO);
		case "horror":
			return buildHorrorPreset(args.theme, args.generatedAtISO);
		case "fantasy":
			return buildFantasyLikePreset(args.theme, "fantasy", args.generatedAtISO);
		case "other":
			return buildFantasyLikePreset(args.theme, "other", args.generatedAtISO);
		default:
			return buildModernPreset(args.theme, args.generatedAtISO);
	}
}
