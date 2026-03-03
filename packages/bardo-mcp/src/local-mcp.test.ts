import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	createWorkspaceRootManager,
	resolveWorkspaceRootFromRoots,
} from "./local-mcp";

describe("local MCP workspace roots", () => {
	test("prefers the first file root from the client roots list", () => {
		const root = resolveWorkspaceRootFromRoots([
			{ uri: "https://example.com/not-local", name: "remote" },
			{ uri: "file:///tmp/game-1", name: "game-1" },
		]);

		expect(root).toBe(fileURLToPath("file:///tmp/game-1"));
	});

	test("keeps the configured workspace when the client does not provide file roots", async () => {
		const manager = createWorkspaceRootManager({
			defaultWorkspaceRoot: "/tmp/default-workspace",
			defaultSource: "cwd",
			listRoots: async () => ({
				roots: [{ uri: "https://example.com/repo", name: "remote" }],
			}),
		});

		const context = await manager.getWorkspaceContext();

		expect(context.workspaceRoot).toBe("/tmp/default-workspace");
		expect(context.source).toBe("cwd");
	});

	test("updates the workspace root when roots/list returns a local file root", async () => {
		const manager = createWorkspaceRootManager({
			defaultWorkspaceRoot: "/tmp/default-workspace",
			defaultSource: "cwd",
			listRoots: async () => ({
				roots: [{ uri: "file:///tmp/game-42", name: "game-42" }],
			}),
		});

		const context = await manager.getWorkspaceContext();

		expect(context.workspaceRoot).toBe(fileURLToPath("file:///tmp/game-42"));
		expect(context.source).toBe("roots");
	});

	test("imports only rulebooks inside the active workspace root", async () => {
		const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bardo-mcp-"));
		const bardoRoot = path.join(workspaceRoot, "bardo");
		await mkdir(path.join(workspaceRoot, "rules"), { recursive: true });
		await mkdir(bardoRoot, { recursive: true });
		const sourcePath = path.join(workspaceRoot, "rules", "shadowdark.md");
		await writeFile(sourcePath, "# Shadowdark", "utf8");

		try {
			const mod = (await import("./local-mcp")) as Record<string, unknown>;
			expect(typeof mod.maybeImportRulebook).toBe("function");
			const imported = await (
				mod.maybeImportRulebook as (args: {
					workspaceRoot: string;
					bardoRoot: string;
					rulebookPath: string;
				}) => Promise<string[]>
			)({
				workspaceRoot,
				bardoRoot,
				rulebookPath: "rules/shadowdark.md",
			});

			expect(imported).toEqual(["rules/sources/rulebook/shadowdark.md"]);
			await expect(
				readFile(
					path.join(bardoRoot, "rules/sources/rulebook/shadowdark.md"),
					"utf8",
				),
			).resolves.toContain("# Shadowdark");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("rejects rulebook imports that escape the active workspace root", async () => {
		const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bardo-mcp-"));
		const externalRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-external-"),
		);
		const bardoRoot = path.join(workspaceRoot, "bardo");
		await mkdir(bardoRoot, { recursive: true });
		const externalRulebook = path.join(externalRoot, "secrets.md");
		await writeFile(externalRulebook, "# do not leak", "utf8");

		try {
			const mod = (await import("./local-mcp")) as Record<string, unknown>;
			expect(typeof mod.maybeImportRulebook).toBe("function");
			await expect(
				(
					mod.maybeImportRulebook as (args: {
						workspaceRoot: string;
						bardoRoot: string;
						rulebookPath: string;
					}) => Promise<string[]>
				)({
					workspaceRoot,
					bardoRoot,
					rulebookPath: externalRulebook,
				}),
			).rejects.toThrow("relative path");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
			await rm(externalRoot, { recursive: true, force: true });
		}
	});

	test("shares one in-flight remote connection across concurrent callers", async () => {
		const mod = (await import("./local-mcp")) as Record<string, unknown>;
		expect(typeof mod.createRemoteConnectionCoordinator).toBe("function");

		let connectCalls = 0;
		let resolveConnect: (() => void) | null = null;
		const coordinator = (
			mod.createRemoteConnectionCoordinator as (args: {
				apiKey: string;
				stderr: { write: (chunk: string) => void };
				getWorkspaceContext: () => Promise<{
					workspaceRoot: string;
					source: "cwd";
					roots: [];
				}>;
				connectRemoteClient: (workspaceRoot: string) => Promise<{
					client: { id: string };
					tools: [{ name: string }];
				}>;
				closeRemoteClient: (client: { id: string } | null) => Promise<void>;
			}) => {
				ensureRemoteConnection: () => Promise<{
					client: { id: string } | null;
					tools: [{ name: string }];
				}>;
			}
		)({
			apiKey: "test-key",
			stderr: { write: () => undefined },
			getWorkspaceContext: async () => ({
				workspaceRoot: "/tmp/workspace",
				source: "cwd",
				roots: [],
			}),
			connectRemoteClient: async (workspaceRoot) => {
				connectCalls += 1;
				expect(workspaceRoot).toBe("/tmp/workspace");
				await new Promise<void>((resolve) => {
					resolveConnect = resolve;
				});
				return {
					client: { id: "remote-client" },
					tools: [{ name: "remote_tool" }],
				};
			},
			closeRemoteClient: async () => undefined,
		});

		const first = coordinator.ensureRemoteConnection();
		const second = coordinator.ensureRemoteConnection();
		await Promise.resolve();

		expect(connectCalls).toBe(1);
		resolveConnect?.();

		const [firstResult, secondResult] = await Promise.all([first, second]);
		expect(connectCalls).toBe(1);
		expect(firstResult.client).toEqual({ id: "remote-client" });
		expect(secondResult.client).toEqual({ id: "remote-client" });
		expect(firstResult.tools).toEqual([{ name: "remote_tool" }]);
		expect(secondResult.tools).toEqual([{ name: "remote_tool" }]);
	});
});
