import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderMarkdown } from "../markdown/markdown";
import { queryContextDocs, refreshContextIndex } from "./indexer";

function readUpdatedAtMap(indexPath: string): Record<string, string> {
	const db = new Database(indexPath, { readonly: true, create: false });
	try {
		const rows = db
			.prepare("SELECT relative_path, updated_at_iso FROM docs")
			.all() as Array<{
			relative_path: string;
			updated_at_iso: string;
		}>;
		return Object.fromEntries(
			rows.map((row) => [row.relative_path, row.updated_at_iso]),
		);
	} finally {
		db.close();
	}
}

describe("context indexer", () => {
	test("incrementally updates changed docs and preserves unchanged doc timestamps", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-context-indexer-"),
		);
		const bardoRoot = path.join(root, "bardo");
		const worldPath = path.join(bardoRoot, "world/locations/river-market.md");
		const entityPath = path.join(bardoRoot, "entities/rose-warden.md");
		const questPath = path.join(bardoRoot, "quests/silver-route.md");
		await mkdir(path.dirname(worldPath), { recursive: true });
		await mkdir(path.dirname(entityPath), { recursive: true });
		await mkdir(path.dirname(questPath), { recursive: true });
		await writeFile(
			worldPath,
			renderMarkdown(
				{ title: "River Market", description: "Location file" },
				"Rumors spread through the river market.",
			),
			"utf8",
		);
		await writeFile(
			entityPath,
			renderMarkdown(
				{ title: "Rose Warden", description: "Entity file" },
				"A vigilant guard captain.",
			),
			"utf8",
		);
		await writeFile(
			questPath,
			renderMarkdown(
				{ title: "Silver Route", description: "Quest file" },
				"Protect the silver route from raiders.",
			),
			"utf8",
		);

		const first = await refreshContextIndex(bardoRoot);
		expect(first.indexRebuilt).toBe(true);
		expect(first.docsIndexed).toBe(3);
		const before = readUpdatedAtMap(first.indexPath);

		await Bun.sleep(20);
		await writeFile(
			worldPath,
			renderMarkdown(
				{ title: "River Market", description: "Location file" },
				"Rumors spread through the river market. Lanterns ripple on the water.",
			),
			"utf8",
		);
		await unlink(entityPath);

		const second = await refreshContextIndex(bardoRoot);
		expect(second.indexRebuilt).toBe(true);
		expect(second.docsIndexed).toBe(2);
		const after = readUpdatedAtMap(second.indexPath);

		expect(after["world/locations/river-market.md"]).not.toBe(
			before["world/locations/river-market.md"],
		);
		expect(after["quests/silver-route.md"]).toBe(
			before["quests/silver-route.md"],
		);
		expect(after["entities/rose-warden.md"]).toBeUndefined();

		const results = queryContextDocs({
			bardoRoot,
			query: "silver route",
			mode: "fast",
			focus: "quests",
			limit: 5,
		});
		expect(results).toHaveLength(1);
		expect(results[0]?.relativePath).toBe("quests/silver-route.md");

		await rm(root, { recursive: true, force: true });
	});
});
