import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderMarkdown } from "../markdown/markdown";
import { retrieveContext } from "./retrieval";

describe("retrieveContext", () => {
	test("reuses cached index when markdown corpus is unchanged", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-context-cache-"));
		const bardoRoot = path.join(root, "bardo");
		const worldPath = path.join(bardoRoot, "world/locations/river-market.md");
		await mkdir(path.dirname(worldPath), { recursive: true });
		await writeFile(
			worldPath,
			renderMarkdown(
				{ title: "River Market", description: "Location file" },
				"Rumors spread through the river market.",
			),
			"utf8",
		);

		const first = await retrieveContext({
			bardoRoot,
			query: "river market",
			mode: "fast",
			focus: "all",
			limit: 10,
		});
		expect(first.indexRebuilt).toBe(true);
		expect(first.docsIndexed).toBe(1);

		const second = await retrieveContext({
			bardoRoot,
			query: "river market",
			mode: "fast",
			focus: "all",
			limit: 10,
		});
		expect(second.indexRebuilt).toBe(false);
		expect(second.docsIndexed).toBe(1);

		await writeFile(
			worldPath,
			renderMarkdown(
				{ title: "River Market", description: "Location file" },
				"Rumors spread through the river market. The lanterns glow tonight.",
			),
			"utf8",
		);

		const third = await retrieveContext({
			bardoRoot,
			query: "lanterns",
			mode: "fast",
			focus: "all",
			limit: 10,
		});
		expect(third.indexRebuilt).toBe(true);
		expect(third.results.length).toBeGreaterThan(0);

		await rm(root, { recursive: true, force: true });
	});
});
