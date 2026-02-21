import { toTitleCase } from "../../../domain/campaign/naming";

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

	return [...names];
}

export function extractNpcNames(transcript: string): string[] {
	const names = new Set<string>();
	const introPattern =
		/"[^"\n]{0,220}\b(?:i am|i'm|my name is)\s+([A-Z][a-zA-Z'-]{1,30})\b[^"\n]*"/g;

	for (const match of transcript.matchAll(introPattern)) {
		const raw = match[1]?.trim();
		if (!raw) continue;
		names.add(raw);
	}

	return [...names];
}
