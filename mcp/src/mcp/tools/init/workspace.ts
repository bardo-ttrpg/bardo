import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseJsonObject } from "../../../domain/campaign/json";
import { BARDO_SUBDIRECTORIES } from "../../../domain/config/constants";
import {
	parseMarkdown,
	renderMarkdown,
} from "../../../domain/markdown/markdown";
import {
	ensureParentDirectoryExists,
	readTextIfExists,
	resolvePathInsideRoot,
} from "../../../infra/filesystem/filesystem";
import {
	dedupeLocationCandidates,
	inferLocationSlug,
	isInformativeText,
	locationCandidatesFromMapData,
	toDisplayName,
} from "./spawn";
import type {
	LocationCandidate,
	WorkspaceHint,
	WorkspaceSummary,
} from "./types";

async function listMarkdownFilesRecursive(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			const nested = await listMarkdownFilesRecursive(fullPath);
			files.push(...nested);
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
			files.push(fullPath);
		}
	}

	return files;
}

export async function listLocationCandidates(
	bardoRoot: string,
): Promise<LocationCandidate[]> {
	const locationsDir = resolvePathInsideRoot(bardoRoot, "world/locations");
	try {
		const entries = await readdir(locationsDir, { withFileTypes: true });
		const candidates: LocationCandidate[] = [];
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
				continue;
			}
			const slug = entry.name.replace(/\.md$/i, "");
			const filePath = resolvePathInsideRoot(
				bardoRoot,
				`world/locations/${entry.name}`,
			);
			const raw = await readTextIfExists(filePath);
			if (raw === null) continue;
			const parsed = parseMarkdown(raw);
			const name = parsed.frontmatter.title?.trim() || toDisplayName(slug);
			candidates.push({ slug, name });
		}
		return dedupeLocationCandidates(candidates);
	} catch {
		return [];
	}
}

export async function readMapLocationCandidates(
	mapPath: string,
): Promise<LocationCandidate[]> {
	const raw = await readTextIfExists(mapPath);
	if (raw === null) return [];
	const parsed = parseMarkdown(raw);
	const mapData = parseJsonObject(parsed.content.trim());
	if (!mapData) return [];
	return locationCandidatesFromMapData(mapData);
}

function getTopLevelDir(relativePath: string): string {
	const normalized = relativePath.replaceAll("\\", "/");
	const first = normalized.split("/")[0];
	return first || "unknown";
}

export async function analyzeWorkspace(
	bardoRoot: string,
): Promise<{ summary: WorkspaceSummary; hint: WorkspaceHint }> {
	const informativeByDirectory: Record<string, number> = {};
	for (const directory of BARDO_SUBDIRECTORIES) {
		informativeByDirectory[directory] = 0;
	}

	const hint: WorkspaceHint = {
		firstLocationName: null,
		firstLocationSlug: null,
		firstQuestTitle: null,
		firstPartyTitle: null,
	};

	let markdownFiles = 0;
	let informativeFiles = 0;
	let totalContentChars = 0;
	let worldLocationFiles = 0;
	let worldInformativeFiles = 0;

	const markdownPaths = await listMarkdownFilesRecursive(bardoRoot);
	for (const absolutePath of markdownPaths) {
		const relativePath = path
			.relative(bardoRoot, absolutePath)
			.replaceAll("\\", "/");
		const topLevel = getTopLevelDir(relativePath);
		const raw = await readTextIfExists(absolutePath);
		if (raw === null) continue;

		const parsed = parseMarkdown(raw);
		const body = parsed.content.trim();
		const combined = `${parsed.frontmatter.title ?? ""}\n${body}`;
		const informative = isInformativeText(combined);

		markdownFiles += 1;
		totalContentChars += body.length;

		if (relativePath.startsWith("world/locations/")) {
			worldLocationFiles += 1;
		}

		if (informative) {
			informativeFiles += 1;
			if (topLevel in informativeByDirectory) {
				informativeByDirectory[topLevel] =
					(informativeByDirectory[topLevel] ?? 0) + 1;
			}
			if (topLevel === "world") {
				worldInformativeFiles += 1;
			}
		}

		if (
			hint.firstLocationName === null &&
			relativePath.startsWith("world/locations/") &&
			(parsed.frontmatter.title?.trim() || path.basename(relativePath, ".md"))
		) {
			const locationName =
				parsed.frontmatter.title?.trim() ?? path.basename(relativePath, ".md");
			hint.firstLocationName = locationName;
			hint.firstLocationSlug = inferLocationSlug(locationName);
		}

		if (
			hint.firstQuestTitle === null &&
			relativePath.startsWith("quests/") &&
			parsed.frontmatter.title?.trim()
		) {
			hint.firstQuestTitle = parsed.frontmatter.title.trim();
		}

		if (
			hint.firstPartyTitle === null &&
			relativePath.startsWith("party/") &&
			parsed.frontmatter.title?.trim()
		) {
			hint.firstPartyTitle = parsed.frontmatter.title.trim();
		}
	}

	const looksSufficientForAutoScene =
		(worldLocationFiles > 0 || worldInformativeFiles > 0) &&
		totalContentChars >= 120 &&
		informativeFiles > 0;

	return {
		summary: {
			markdownFiles,
			informativeFiles,
			totalContentChars,
			informativeByDirectory,
			looksSufficientForAutoScene,
			worldLocationFiles,
			worldInformativeFiles,
			workspaceEmpty: markdownFiles === 0,
		},
		hint,
	};
}
export async function ensureLocationMarkdownFile(
	bardoRoot: string,
	locationSlug: string,
	locationName: string,
): Promise<void> {
	const filePath = resolvePathInsideRoot(
		bardoRoot,
		`world/locations/${locationSlug}.md`,
	);
	const raw = await readTextIfExists(filePath);
	if (raw !== null) {
		return;
	}

	const payload = {
		id: locationSlug,
		name: locationName,
		discoveryStatus: "known",
		tags: ["location", "starting-point"],
		notes: "Starting location initialized by campaign setup.",
	};

	await ensureParentDirectoryExists(filePath);
	await writeFile(
		filePath,
		renderMarkdown(
			{
				description: "Location or point of interest",
				title: locationName,
			},
			JSON.stringify(payload, null, 2),
		),
		"utf8",
	);
}
