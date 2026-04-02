import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeTextAtomic } from "./file-utils";

describe("writeTextAtomic", () => {
	test("overwrites the target file without leaving temp files behind", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-file-utils-"));
		const targetPath = path.join(root, "config.json");

		try {
			await writeTextAtomic(targetPath, '{"version":1}');
			await writeTextAtomic(targetPath, '{"version":2}');

			await expect(readFile(targetPath, "utf8")).resolves.toBe('{"version":2}');
			const entries = await readdir(root);
			expect(entries).toEqual(["config.json"]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("writes private files for stored local credentials", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-file-utils-"));
		const targetPath = path.join(root, "config.json");

		try {
			await writeTextAtomic(targetPath, '{"version":2}');

			const targetStat = await stat(targetPath);
			expect(targetStat.mode & 0o777).toBe(0o600);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
