import { buildPresetForCategory } from "./map-presets";
import { inferLocationSlug, inferThemeCategory } from "./spawn";
import type { ProceduralMapResult, WorkspaceHint } from "./types";

export function buildWorkspaceBasedScene(
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

export function generateProceduralMap(theme: string): ProceduralMapResult {
	const category = inferThemeCategory(theme);
	const generatedAtISO = new Date().toISOString();
	return buildPresetForCategory({ category, theme, generatedAtISO });
}
