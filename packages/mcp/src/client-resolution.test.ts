import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
	resolveAutoInstallClientSelection,
	resolveDoctorClientSelection,
} from "./client-resolution";

async function createTempDir(prefix: string): Promise<string> {
	return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("client resolution", () => {
	test("auto-detects a single installed client for install", async () => {
		const workspaceRoot = await createTempDir("bardo-client-resolution-");
		try {
			const configPath = path.join(workspaceRoot, ".gemini/settings.json");
			await mkdir(path.dirname(configPath), { recursive: true });
			await writeFile(configPath, "{}\n", "utf8");

			const resolved = await resolveAutoInstallClientSelection({
				client: "auto",
				workspaceRoot,
			});

			expect(resolved.client).toBe("gemini");
			expect(resolved.detectionSource).toBe("workspace");
			expect(resolved.configPath).toBe(configPath);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("auto-detects Gemini from a workspace settings file", async () => {
		const workspaceRoot = await createTempDir("bardo-client-resolution-");
		try {
			const configPath = path.join(workspaceRoot, ".gemini/settings.json");
			await mkdir(path.dirname(configPath), { recursive: true });
			await writeFile(configPath, "{}\n", "utf8");

			const resolved = await resolveAutoInstallClientSelection({
				client: "auto",
				workspaceRoot,
			});

			expect(resolved.client).toBe("gemini");
			expect(resolved.detectionSource).toBe("workspace");
			expect(resolved.configPath).toBe(configPath);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("rejects ambiguous workspace auto-detection", async () => {
		const workspaceRoot = await createTempDir("bardo-client-resolution-");
		try {
			const geminiPath = path.join(workspaceRoot, ".gemini/settings.json");
			const cursorPath = path.join(workspaceRoot, ".cursor/mcp.json");
			await mkdir(path.dirname(geminiPath), { recursive: true });
			await mkdir(path.dirname(cursorPath), { recursive: true });
			await writeFile(geminiPath, "{}\n", "utf8");
			await writeFile(cursorPath, "{}\n", "utf8");

			await expect(
				resolveAutoInstallClientSelection({
					client: "auto",
					workspaceRoot,
				}),
			).rejects.toThrow("Multiple client configs detected");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("resolves doctor selection for generic clients without auto-install", async () => {
		const workspaceRoot = await createTempDir("bardo-client-resolution-");
		try {
			const resolved = await resolveDoctorClientSelection({
				client: "generic",
				workspaceRoot,
			});

			expect(resolved.client).toBe("generic");
			expect(resolved.detectionSource).toBe("explicit");
			expect(resolved.configPath).toBeNull();
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});
});
