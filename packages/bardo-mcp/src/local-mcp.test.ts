import { describe, expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	createRemoteToolAccessController,
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
			).rejects.toThrow("workspace root");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
			await rm(externalRoot, { recursive: true, force: true });
		}
	});

	test("rejects rulebook imports through workspace symlinks that escape the root", async () => {
		const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bardo-mcp-"));
		const externalRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-external-"),
		);
		const bardoRoot = path.join(workspaceRoot, "bardo");
		await mkdir(path.join(workspaceRoot, "rules"), { recursive: true });
		await mkdir(bardoRoot, { recursive: true });
		const externalRulebook = path.join(externalRoot, "secrets.md");
		const linkedRulebook = path.join(workspaceRoot, "rules", "linked.md");
		await writeFile(externalRulebook, "# escaped by symlink", "utf8");
		await symlink(externalRulebook, linkedRulebook);

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
					rulebookPath: "rules/linked.md",
				}),
			).rejects.toThrow("workspace root");
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

	test("preserves existing workspace core files when bootstrap runs twice", async () => {
		const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bardo-mcp-"));
		const bardoRoot = path.join(workspaceRoot, "bardo");

		try {
			const mod = (await import("./local-mcp")) as Record<string, unknown>;
			expect(typeof mod.ensureWorkspaceCoreFiles).toBe("function");

			const ensureWorkspaceCoreFiles = mod.ensureWorkspaceCoreFiles as (args: {
				bardoRoot: string;
				workspaceRoot: string;
				ruleset: string | null;
				nowIso: string;
				importedRulebooks: string[];
			}) => Promise<void>;

			await mkdir(path.join(bardoRoot, "_settings"), { recursive: true });
			await mkdir(path.join(bardoRoot, "state"), { recursive: true });
			await mkdir(path.join(bardoRoot, "events"), { recursive: true });
			await writeFile(
				path.join(bardoRoot, "manifest.json"),
				JSON.stringify(
					{
						version: 1,
						createdAtISO: "2026-03-01T00:00:00.000Z",
						updatedAtISO: "2026-03-01T00:00:00.000Z",
						workspaceRoot,
						bardoRoot,
						ruleset: "shadowdark",
						importedRulebooks: ["rules/sources/rulebook/original.md"],
					},
					null,
					2,
				),
				"utf8",
			);
			await writeFile(
				path.join(bardoRoot, "_settings/settings.md"),
				"existing settings",
				"utf8",
			);
			await writeFile(
				path.join(bardoRoot, "state/current.md"),
				"existing state",
				"utf8",
			);
			await writeFile(
				path.join(bardoRoot, "events/history.md"),
				"existing history",
				"utf8",
			);

			await ensureWorkspaceCoreFiles({
				bardoRoot,
				workspaceRoot,
				ruleset: null,
				nowIso: "2026-03-03T00:00:00.000Z",
				importedRulebooks: [],
			});

			const manifest = JSON.parse(
				await readFile(path.join(bardoRoot, "manifest.json"), "utf8"),
			) as {
				createdAtISO: string;
				updatedAtISO: string;
				importedRulebooks: string[];
			};

			expect(manifest.createdAtISO).toBe("2026-03-01T00:00:00.000Z");
			expect(manifest.updatedAtISO).toBe("2026-03-03T00:00:00.000Z");
			expect(manifest.importedRulebooks).toEqual([
				"rules/sources/rulebook/original.md",
			]);
			await expect(
				readFile(path.join(bardoRoot, "_settings/settings.md"), "utf8"),
			).resolves.toBe("existing settings");
			await expect(
				readFile(path.join(bardoRoot, "state/current.md"), "utf8"),
			).resolves.toBe("existing state");
			await expect(
				readFile(path.join(bardoRoot, "events/history.md"), "utf8"),
			).resolves.toBe("existing history");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("hides premium remote tools from lower plans using annotations and env overrides", async () => {
		const access = createRemoteToolAccessController({
			plan: "free",
			env: {
				BARDO_PREMIUM_REMOTE_TOOLS: "remote_env_solo",
				BARDO_SOLO_PLUS_REMOTE_TOOLS: "remote_env_plus",
			},
		});

		const visible = access.filterTools([
			{ name: "remote_free" },
			{
				name: "remote_annotated_solo",
				annotations: { "x-bardo-min-plan": "solo" },
			},
			{ name: "remote_env_solo" },
			{ name: "remote_env_plus" },
		]);

		expect(visible.map((tool) => tool.name)).toEqual(["remote_free"]);
		expect(
			access.isAllowed({
				name: "remote_annotated_solo",
				annotations: { "x-bardo-min-plan": "solo" },
			}),
		).toBe(false);
		expect(access.blockedMessage("remote_env_plus")).toContain("solo_plus");
	});
});
