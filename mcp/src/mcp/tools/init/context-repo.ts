import { writeFile } from "node:fs/promises";
import { renderMarkdown } from "../../../domain/markdown/markdown";
import {
	ensureParentDirectoryExists,
	readTextIfExists,
	resolvePathInsideRoot,
} from "../../../infra/filesystem/filesystem";

async function writeIfMissing(
	filePath: string,
	content: string,
): Promise<void> {
	const existing = await readTextIfExists(filePath);
	if (existing !== null) {
		return;
	}
	await ensureParentDirectoryExists(filePath);
	await writeFile(filePath, content, "utf8");
}

export async function ensureContextRepositoryScaffold(
	bardoRoot: string,
): Promise<void> {
	const files: Array<{ path: string; title: string; description: string }> = [
		{
			path: "context/catalog/entities.md",
			title: "Entity Catalog",
			description: "Canonical entity index for world simulation and retrieval",
		},
		{
			path: "context/catalog/locations.md",
			title: "Location Catalog",
			description: "Canonical location index for travel and world continuity",
		},
		{
			path: "context/catalog/factions.md",
			title: "Faction Catalog",
			description: "Canonical faction index and relationships",
		},
		{
			path: "context/timeline/events.md",
			title: "Event Timeline",
			description:
				"Chronological record of important world and campaign events",
		},
		{
			path: "context/threads/open-loops.md",
			title: "Open Narrative Loops",
			description: "Unresolved plot threads and hooks awaiting progression",
		},
		{
			path: "context/causality/links.md",
			title: "Causality Links",
			description:
				"Cause-and-effect links that preserve continuity and internal logic",
		},
		{
			path: "simulation/rules.md",
			title: "Simulation Rules",
			description:
				"Deterministic world evolution rules used by simulation tick tooling",
		},
		{
			path: "simulation/queue.md",
			title: "Simulation Queue",
			description:
				"Scheduled simulation jobs and bounded autonomous evolution intents",
		},
	];

	for (const file of files) {
		const filePath = resolvePathInsideRoot(bardoRoot, file.path);
		await writeIfMissing(
			filePath,
			renderMarkdown(
				{
					title: file.title,
					description: file.description,
				},
				"",
			),
		);
	}
}
