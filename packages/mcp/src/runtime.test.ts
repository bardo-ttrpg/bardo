import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { runCli } from "./runtime";
import { resolveBardoRoot } from "./workspace-schema";

function createWriter() {
	let output = "";
	return {
		writer: {
			write(chunk: string) {
				output += chunk;
			},
		},
		get output() {
			return output;
		},
	};
}

describe("runtime CLI", () => {
	test("init writes the manifest used by MCP workspace status", async () => {
		const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bardo-cli-"));
		const bardoRoot = resolveBardoRoot(workspaceRoot);
		const stdout = createWriter();

		try {
			await writeFile(
				path.join(workspaceRoot, "RULEBOOK.md"),
				"# Rules\n\n## Checks\nRoll a d20.",
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, "campaign-notes.md"),
				[
					"# Campaign",
					"Current location: Lanternford.",
					"Quest: Find the missing cartographer.",
				].join("\n"),
				"utf8",
			);
			await mkdir(bardoRoot, { recursive: true });

			const exitCode = await runCli(
				[
					"init",
					"--workspace-root",
					workspaceRoot,
					"--rulebook",
					path.join(workspaceRoot, "RULEBOOK.md"),
				],
				{ stdout: stdout.writer },
			);

			expect(exitCode).toBe(0);
			expect(stdout.output).toContain("Readiness: ready");
			const manifest = JSON.parse(
				await readFile(path.join(bardoRoot, "manifest.json"), "utf8"),
			) as { campaignBootstrap?: { readiness?: { status?: string } } };
			expect(manifest.campaignBootstrap?.readiness?.status).toBe("ready");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});
});
