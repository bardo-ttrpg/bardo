import { toTitleCase } from "../../../domain/campaign/naming";

const LOCATION_TERMS = new Set([
	"forest",
	"woods",
	"wood",
	"inn",
	"tavern",
	"pub",
	"market",
	"square",
	"village",
	"town",
	"city",
	"mountain",
	"mountains",
	"river",
	"lake",
	"road",
	"trail",
	"gate",
	"chapel",
	"temple",
]);

function normalizeNpcCandidate(raw: string | undefined): string | null {
	const trimmed = raw?.trim().replace(/\s+/g, " ");
	if (!trimmed) {
		return null;
	}
	const lastToken = trimmed.split(" ").at(-1)?.toLowerCase() ?? "";
	if (LOCATION_TERMS.has(lastToken)) {
		return null;
	}
	return trimmed;
}

export function extractLocationNames(transcript: string): string[] {
	const names = new Set<string>();

	const signPattern = /WELCOME TO\s+([A-Z][A-Z\s'-]{1,60})/g;
	for (const match of transcript.matchAll(signPattern)) {
		const raw = match[1]?.trim();
		if (!raw) continue;
		names.add(toTitleCase(raw));
	}

	const welcomePattern =
		/\bwelcome to\s+([A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){0,3})\b/g;
	for (const match of transcript.matchAll(welcomePattern)) {
		const raw = match[1]?.trim();
		if (!raw) continue;
		names.add(raw);
	}

	const calledPattern =
		/\b(?:called|named)\s+([A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){0,3})\b/g;
	for (const match of transcript.matchAll(calledPattern)) {
		const raw = match[1]?.trim();
		if (!raw) continue;
		names.add(raw);
	}

	const directionalPattern =
		/\b(?:near|at|in|into|toward|towards|from)\s+(?:the\s+)?([A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){0,3})\b/g;
	for (const match of transcript.matchAll(directionalPattern)) {
		const raw = match[1]?.trim();
		if (!raw) continue;
		names.add(raw);
	}

	return [...names];
}

export function extractNpcNames(transcript: string): string[] {
	const names = new Set<string>();
	const introPatterns = [
		/\b(?:i am|i'm|my name is|name's)\s+([A-Z][a-zA-Z'-]{1,30}(?:\s+[A-Z][a-zA-Z'-]{1,30}){0,2})\b/gi,
		/\b(?:first was|then it was|then|it was)\s+([A-Z][a-zA-Z'-]{1,30})\b/gi,
		/\b([A-Z][a-zA-Z'-]{1,30})\s+the\s+(?:miller|blacksmith|merchant|guard|shepherd|barkeep|woodsman|apprentice|farmer|trader|courier)\b/gi,
	];

	for (const pattern of introPatterns) {
		for (const match of transcript.matchAll(pattern)) {
			const normalized = normalizeNpcCandidate(match[1]);
			if (!normalized) continue;
			names.add(normalized);
		}
	}

	return [...names];
}
