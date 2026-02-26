import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderMarkdown } from "../../../domain/markdown/markdown";
import { validateCoreIntegrity } from "./core-integrity";
import { resolveInitPaths } from "./paths";

async function makeTempRoot(prefix: string): Promise<string> {
	return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("validateCoreIntegrity", () => {
	test("reports missing required files and directories", async () => {
		const root = await makeTempRoot("bardo-integrity-missing-");
		const bardoRoot = path.join(root, "bardo");
		await mkdir(bardoRoot, { recursive: true });

		const result = await validateCoreIntegrity(bardoRoot);

		expect(result.ok).toBe(false);
		expect(
			result.missingPaths.some((entry) => entry.endsWith("_settings")),
		).toBe(true);
		expect(
			result.missingPaths.some((entry) =>
				entry.endsWith("_settings/settings.md"),
			),
		).toBe(true);
		expect(
			result.missingPaths.some((entry) => entry.endsWith("state/current.md")),
		).toBe(true);

		await rm(root, { recursive: true, force: true });
	});

	test("reports invalid structured files", async () => {
		const root = await makeTempRoot("bardo-integrity-invalid-");
		const bardoRoot = path.join(root, "bardo");
		await mkdir(path.join(bardoRoot, "_settings"), { recursive: true });
		await mkdir(path.join(bardoRoot, "state"), { recursive: true });

		const paths = resolveInitPaths(bardoRoot);
		await writeFile(
			paths.settingsPath,
			renderMarkdown(
				{ title: "Settings", description: "test" },
				JSON.stringify({ diceRoller: "player" }, null, 2),
			),
			"utf8",
		);
		await writeFile(
			paths.statePath,
			renderMarkdown({ title: "State", description: "test" }, "not-json"),
			"utf8",
		);
		await writeFile(
			paths.historyPath,
			renderMarkdown({ title: "History", description: "test" }, "entry 1"),
			"utf8",
		);

		const result = await validateCoreIntegrity(bardoRoot);
		expect(result.ok).toBe(false);
		expect(result.invalidPaths).toContain(paths.statePath);

		await rm(root, { recursive: true, force: true });
	});
});
