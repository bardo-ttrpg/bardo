import { describe, expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bootstrapImportedRulebook } from "./rules-bootstrap";

describe("bootstrapImportedRulebook", () => {
	test("creates normalized rule files, metadata, tags, and a depth recommendation", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-rules-bootstrap-"),
		);
		const bardoRoot = path.join(root, ".bardo");
		const sourceRelativePath = "rules/rulebook.md";
		const sourcePath = path.join(bardoRoot, sourceRelativePath);

		try {
			await mkdir(path.dirname(sourcePath), { recursive: true });
			await writeFile(
				sourcePath,
				[
					"# Lantern Realms",
					"",
					"Welcome to Lantern Realms.",
					"",
					"LANTERN REALMS CORE RULES",
					"",
					"## Character Creation",
					"",
					"Choose attributes, skills, and a background for the character.",
					"",
					"Example: A ranger begins with high Wits and the scout skill.",
					"",
					"LANTERN REALMS CORE RULES",
					"",
					"## Combat",
					"",
					"Initiative decides turn order. Attacks deal damage and armor improves defense.",
					"",
					"| Roll | Outcome |",
					"| --- | --- |",
					"| 10+ | Hit |",
					"| 6-9 | Glancing hit |",
					"",
					"Exception: Surprise lets an attacker act before initiative is rolled.",
					"",
					"LANTERN REALMS CORE RULES",
					"",
					"## Factions and Travel",
					"",
					"Track faction reputation, politics, law, and religion across settlements.",
					"",
					"Travel procedures, survival pressure, downtime recovery, and consequence tracking matter between adventures.",
					"",
				].join("\n"),
				"utf8",
			);

			const result = await bootstrapImportedRulebook({
				bardoRoot,
				sourceRelativePath,
				nowIso: "2026-04-07T00:00:00.000Z",
			});

			expect(result.sectionCount).toBe(3);
			expect(result.recommendedSimulationDepth).toBe("deep");
			expect(result.indexPath).toBe("rules/normalized/index.json");

			const normalizedEntries = (
				await readdir(path.join(bardoRoot, "rules/normalized"))
			).sort();
			expect(normalizedEntries).toEqual([
				"01-character-creation.md",
				"02-combat.md",
				"03-factions-and-travel.md",
				"index.json",
			]);

			const combatRaw = await readFile(
				path.join(bardoRoot, "rules/normalized/02-combat.md"),
				"utf8",
			);
			expect(combatRaw).toContain("# Combat");
			expect(combatRaw).toContain("| Roll | Outcome |");
			expect(combatRaw).toContain("Exception: Surprise");
			expect(combatRaw).not.toContain("LANTERN REALMS CORE RULES");

			const index = JSON.parse(
				await readFile(
					path.join(bardoRoot, "rules/normalized/index.json"),
					"utf8",
				),
			) as {
				recommendedSimulationDepth: string;
				simulationSignals: string[];
				sections: Array<{
					title: string;
					filename: string;
					tags: string[];
					hasTables: boolean;
					hasExamples: boolean;
					hasExceptions: boolean;
				}>;
			};

			expect(index.recommendedSimulationDepth).toBe("deep");
			expect(index.simulationSignals.length).toBeGreaterThan(0);
			expect(index.sections).toHaveLength(3);
			expect(index.sections[0]).toMatchObject({
				title: "Character Creation",
				filename: "01-character-creation.md",
				hasExamples: true,
			});
			expect(index.sections[1]).toMatchObject({
				title: "Combat",
				filename: "02-combat.md",
				hasTables: true,
				hasExceptions: true,
			});
			expect(index.sections[1]?.tags).toContain("combat");
			expect(index.sections[2]?.tags).toContain("faction");
			expect(index.sections[2]?.tags).toContain("travel");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("defaults simulation depth to standard when signals are low confidence", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-rules-bootstrap-"),
		);
		const bardoRoot = path.join(root, ".bardo");
		const sourceRelativePath = "rules/rulebook.md";
		const sourcePath = path.join(bardoRoot, sourceRelativePath);

		try {
			await mkdir(path.dirname(sourcePath), { recursive: true });
			await writeFile(
				sourcePath,
				[
					"# Quiet Rules",
					"",
					"## Core Procedure",
					"",
					"When a risky action happens, roll and compare the result to the guide.",
					"",
				].join("\n"),
				"utf8",
			);

			const result = await bootstrapImportedRulebook({
				bardoRoot,
				sourceRelativePath,
				nowIso: "2026-04-07T00:00:00.000Z",
			});

			expect(result.recommendedSimulationDepth).toBe("standard");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("replaces stale normalized files on re-run", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-rules-bootstrap-"),
		);
		const bardoRoot = path.join(root, ".bardo");
		const sourceRelativePath = "rules/rulebook.md";
		const sourcePath = path.join(bardoRoot, sourceRelativePath);

		try {
			await mkdir(path.dirname(sourcePath), { recursive: true });
			await writeFile(
				sourcePath,
				[
					"# First Book",
					"",
					"## One",
					"",
					"Alpha.",
					"",
					"## Two",
					"",
					"Beta.",
				].join("\n"),
				"utf8",
			);
			await bootstrapImportedRulebook({
				bardoRoot,
				sourceRelativePath,
				nowIso: "2026-04-07T00:00:00.000Z",
			});

			await writeFile(
				sourcePath,
				["# First Book", "", "## One", "", "Gamma only."].join("\n"),
				"utf8",
			);
			const result = await bootstrapImportedRulebook({
				bardoRoot,
				sourceRelativePath,
				nowIso: "2026-04-08T00:00:00.000Z",
			});

			expect(result.sectionCount).toBe(1);
			const normalizedEntries = (
				await readdir(path.join(bardoRoot, "rules/normalized"))
			).sort();
			expect(normalizedEntries).toEqual(["01-one.md", "index.json"]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
