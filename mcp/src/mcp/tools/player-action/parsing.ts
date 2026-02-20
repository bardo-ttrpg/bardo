import { slugify, toDisplayName } from "../../../domain/campaign/naming";
import type { Intent, KnownLocation } from "./types";

function isGenericTravelTarget(text: string): boolean {
	const normalized = text.trim().toLowerCase();
	return [
		"village",
		"the village",
		"town",
		"the town",
		"city",
		"the city",
		"settlement",
		"hamlet",
		"camp",
		"outpost",
	].includes(normalized);
}

export function resolveTravelTarget(
	targetText: string,
	knownLocations: KnownLocation[],
): { slug: string; name: string } {
	const candidateSlug = slugify(targetText, "unknown-place");
	const candidateLower = targetText.trim().toLowerCase();

	const exactSlugMatch = knownLocations.find(
		(location) => location.slug === candidateSlug,
	);
	if (exactSlugMatch) {
		return { slug: exactSlugMatch.slug, name: exactSlugMatch.name };
	}

	const exactNameMatch = knownLocations.find(
		(location) => location.name.trim().toLowerCase() === candidateLower,
	);
	if (exactNameMatch) {
		return { slug: exactNameMatch.slug, name: exactNameMatch.name };
	}

	const partialNameMatch = knownLocations.find((location) =>
		location.name.trim().toLowerCase().includes(candidateLower),
	);
	if (partialNameMatch) {
		return { slug: partialNameMatch.slug, name: partialNameMatch.name };
	}

	if (isGenericTravelTarget(targetText) && knownLocations.length === 1) {
		const only = knownLocations[0];
		if (only) {
			return { slug: only.slug, name: only.name };
		}
	}

	return { slug: candidateSlug, name: toDisplayName(targetText) };
}

export function extractTargetLocation(action: string): string | null {
	const direct = action.match(
		/(?:travel|go|walk|journey|head|move|ride|sail|enter)\s+(?:to|toward|into)?\s*(?:the\s+)?([a-z0-9'\-\s]{2,80})/i,
	);
	if (direct?.[1]) {
		return direct[1].trim();
	}
	const preposition = action.match(
		/(?:to|toward|into)\s+(?:the\s+)?([a-z0-9'\-\s]{2,80})/i,
	);
	if (preposition?.[1]) {
		return preposition[1].trim();
	}
	return null;
}

export function parseIntent(action: string): Intent {
	const text = action.toLowerCase();
	if (
		/(travel|go\s+to|walk\s+to|journey|head\s+to|move\s+to|ride\s+to|sail\s+to|enter)/.test(
			text,
		)
	) {
		return "travel";
	}
	if (/(explore|search|investigate|scout|look around)/.test(text)) {
		return "explore";
	}
	if (/(talk|speak|ask|chat|convince|persuade|negotiate)/.test(text)) {
		return "social";
	}
	if (/(rest|sleep|camp|wait)/.test(text)) {
		return "rest";
	}
	if (/(fight|attack|battle|combat|ambush)/.test(text)) {
		return "combat";
	}
	return "general";
}

export function defaultAdvanceMinutes(intent: Intent): number {
	switch (intent) {
		case "travel":
			return 60;
		case "explore":
			return 45;
		case "social":
			return 20;
		case "rest":
			return 480;
		case "combat":
			return 30;
		default:
			return 15;
	}
}

export function normalizeIsoDate(input: string): string {
	const date = new Date(input);
	if (Number.isNaN(date.getTime())) {
		return new Date().toISOString();
	}
	return date.toISOString();
}
