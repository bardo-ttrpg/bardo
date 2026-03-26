import { describe, expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readdir,
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

		const initial = await manager.getWorkspaceContext();
		const context = await manager.refreshFromClientRoots();

		expect(initial.workspaceRoot).toBe("/tmp/default-workspace");
		expect(initial.source).toBe("cwd");
		expect(context.workspaceRoot).toBe("/tmp/default-workspace");
		expect(context.source).toBe("cwd");
	});

	test("returns the configured workspace until a roots refresh completes", async () => {
		const manager = createWorkspaceRootManager({
			defaultWorkspaceRoot: "/tmp/default-workspace",
			defaultSource: "cwd",
			listRoots: async () => ({
				roots: [{ uri: "file:///tmp/game-42", name: "game-42" }],
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

		const context = await manager.refreshFromClientRoots();

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
			await mkdir(path.join(bardoRoot, "projections"), { recursive: true });
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
			await writeFile(
				path.join(bardoRoot, "projections/current-state.md"),
				"existing projection",
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
			await expect(
				readFile(path.join(bardoRoot, "projections/current-state.md"), "utf8"),
			).resolves.toBe("existing projection");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("acquires the workspace lock atomically under concurrent calls", async () => {
		const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bardo-mcp-"));

		try {
			const mod = (await import("./local-mcp")) as Record<string, unknown>;
			expect(typeof mod.acquireWorkspaceLockForTests).toBe("function");
			expect(typeof mod.releaseWorkspaceLockForTests).toBe("function");

			const acquireWorkspaceLockForTests = mod.acquireWorkspaceLockForTests as (
				workspaceRoot: string,
			) => Promise<void>;
			const releaseWorkspaceLockForTests = mod.releaseWorkspaceLockForTests as (
				workspaceRoot: string,
			) => Promise<void>;

			await acquireWorkspaceLockForTests(workspaceRoot);

			const bunPath = Bun.which("bun");
			expect(bunPath).toBeString();
			const child = Bun.spawn({
				cmd: [
					bunPath ?? "bun",
					"--eval",
					`import { acquireWorkspaceLockForTests } from "./local-mcp.ts";
					try {
						await acquireWorkspaceLockForTests(Bun.env.WORKSPACE_ROOT ?? "");
						console.log("acquired");
						process.exit(0);
					} catch (error) {
						console.error(String(error instanceof Error ? error.message : error));
						process.exit(1);
					}`,
				],
				cwd: path.dirname(fileURLToPath(import.meta.url)),
				env: {
					...process.env,
					WORKSPACE_ROOT: workspaceRoot,
				},
				stdout: "pipe",
				stderr: "pipe",
			});

			const stderrText = await new Response(child.stderr).text();
			const exitCode = await child.exited;

			expect(exitCode).toBe(1);
			expect(stderrText).toContain("WORKSPACE_LOCKED");

			await releaseWorkspaceLockForTests(workspaceRoot);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("stores imported rulebook hashes and reports drift when source files change", async () => {
		const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bardo-mcp-"));
		const bardoRoot = path.join(workspaceRoot, "bardo");
		const rulebookRelativePath = "rules/sources/rulebook/core-rules.md";
		const rulebookPath = path.join(bardoRoot, rulebookRelativePath);

		try {
			const mod = (await import("./local-mcp")) as Record<string, unknown>;
			expect(typeof mod.ensureWorkspaceCoreFiles).toBe("function");
			expect(typeof mod.detectRulebookHashDrift).toBe("function");

			await mkdir(path.dirname(rulebookPath), { recursive: true });
			await writeFile(rulebookPath, "# Core Rules v1\n", "utf8");
			await mkdir(path.join(bardoRoot, "_settings"), { recursive: true });
			await mkdir(path.join(bardoRoot, "state"), { recursive: true });
			await mkdir(path.join(bardoRoot, "events"), { recursive: true });

			await (
				mod.ensureWorkspaceCoreFiles as (args: {
					bardoRoot: string;
					workspaceRoot: string;
					ruleset: string | null;
					nowIso: string;
					importedRulebooks: string[];
				}) => Promise<void>
			)({
				bardoRoot,
				workspaceRoot,
				ruleset: "shadowdark",
				nowIso: "2026-03-04T00:00:00.000Z",
				importedRulebooks: [rulebookRelativePath],
			});

			const manifest = JSON.parse(
				await readFile(path.join(bardoRoot, "manifest.json"), "utf8"),
			) as {
				rulebookHashes?: Record<string, string>;
			};
			expect(typeof manifest.rulebookHashes?.[rulebookRelativePath]).toBe(
				"string",
			);
			expect(manifest.rulebookHashes?.[rulebookRelativePath]).toHaveLength(64);

			await writeFile(rulebookPath, "# Core Rules v2\n", "utf8");

			const drift = await (
				mod.detectRulebookHashDrift as (args: {
					bardoRoot: string;
				}) => Promise<{
					detected: boolean;
					warnings: Array<{
						warning: string;
						relativePath: string;
						old_hash: string;
						new_hash: string;
						options: string[];
					}>;
				}>
			)({
				bardoRoot,
			});

			expect(drift.detected).toBe(true);
			expect(drift.warnings).toHaveLength(1);
			expect(drift.warnings[0]).toMatchObject({
				warning: "RULEBOOK_MODIFIED",
				relativePath: rulebookRelativePath,
			});
			expect(drift.warnings[0]?.options).toEqual([
				"re-parse (creates new manifest)",
				"ignore (use existing manifest)",
				"diff-and-merge",
			]);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("ingests supplements with additive-only capability manifest updates", async () => {
		const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bardo-mcp-"));
		const bardoRoot = path.join(workspaceRoot, "bardo");
		const sourceSupplement = path.join(workspaceRoot, "imports", "psi.md");

		try {
			const mod = (await import("./local-mcp")) as Record<string, unknown>;
			expect(typeof mod.addWorkspaceSupplement).toBe("function");
			expect(typeof mod.ensureWorkspaceCoreFiles).toBe("function");

			await mkdir(path.join(workspaceRoot, "imports"), { recursive: true });
			await mkdir(path.join(bardoRoot, "_settings"), { recursive: true });
			await mkdir(path.join(bardoRoot, "state"), { recursive: true });
			await mkdir(path.join(bardoRoot, "events"), { recursive: true });
			await writeFile(sourceSupplement, "# Psionics\n", "utf8");
			await (
				mod.ensureWorkspaceCoreFiles as (args: {
					bardoRoot: string;
					workspaceRoot: string;
					ruleset: string | null;
					nowIso: string;
					importedRulebooks: string[];
				}) => Promise<void>
			)({
				bardoRoot,
				workspaceRoot,
				ruleset: "shadowdark",
				nowIso: "2026-03-04T00:00:00.000Z",
				importedRulebooks: [],
			});

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
						importedRulebooks: [],
						capabilityManifest: ["rules_lookup", "session_recap"],
					},
					null,
					2,
				),
				"utf8",
			);

			const added = await (
				mod.addWorkspaceSupplement as (args: {
					workspaceRoot: string;
					bardoRoot: string;
					supplementPath: string;
					scope: "additive_only";
					capabilityAdditions: string[];
				}) => Promise<{
					copiedTo: string;
					addedCapabilities: string[];
				}>
			)({
				workspaceRoot,
				bardoRoot,
				supplementPath: "imports/psi.md",
				scope: "additive_only",
				capabilityAdditions: ["magic", "session_recap"],
			});

			expect(added.copiedTo).toContain("rules/sources/expansions/psi.md");
			expect(added.addedCapabilities).toEqual(["magic"]);

			const manifest = JSON.parse(
				await readFile(path.join(bardoRoot, "manifest.json"), "utf8"),
			) as {
				capabilityManifest: string[];
				supplements: Array<{
					relativePath: string;
					scope: string;
				}>;
			};
			expect(manifest.capabilityManifest).toEqual([
				"rules_lookup",
				"session_recap",
				"magic",
			]);
			expect(manifest.supplements).toHaveLength(1);
			expect(manifest.supplements[0]).toMatchObject({
				relativePath: "rules/sources/expansions/psi.md",
				scope: "additive_only",
			});
			await expect(
				readFile(path.join(bardoRoot, "events/history.md"), "utf8"),
			).resolves.toContain("supplement_activation");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("rejects supplement ingestion when scope is not additive_only", async () => {
		const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bardo-mcp-"));
		const bardoRoot = path.join(workspaceRoot, "bardo");
		const sourceSupplement = path.join(workspaceRoot, "imports", "psi.md");

		try {
			const mod = (await import("./local-mcp")) as Record<string, unknown>;
			expect(typeof mod.addWorkspaceSupplement).toBe("function");
			await mkdir(path.join(workspaceRoot, "imports"), { recursive: true });
			await mkdir(path.join(bardoRoot, "events"), { recursive: true });
			await writeFile(path.join(bardoRoot, "events/history.md"), "", "utf8");
			await writeFile(sourceSupplement, "# Psionics\n", "utf8");

			await expect(
				(
					mod.addWorkspaceSupplement as (args: {
						workspaceRoot: string;
						bardoRoot: string;
						supplementPath: string;
						scope: string;
						capabilityAdditions: string[];
					}) => Promise<unknown>
				)({
					workspaceRoot,
					bardoRoot,
					supplementPath: "imports/psi.md",
					scope: "override",
					capabilityAdditions: ["magic"],
				}),
			).rejects.toThrow("additive_only");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("recovers orphaned tmp files safely on startup", async () => {
		const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bardo-mcp-"));
		const bardoRoot = path.join(workspaceRoot, "bardo");

		try {
			const mod = (await import("./local-mcp")) as Record<string, unknown>;
			expect(typeof mod.recoverWorkspaceTempFiles).toBe("function");

			const recoveredTarget = path.join(bardoRoot, "state", "current.json");
			const recoveredTemp = `${recoveredTarget}.abcd-1234.tmp`;
			const invalidTarget = path.join(bardoRoot, "state", "broken.json");
			const invalidTemp = `${invalidTarget}.efgh-5678.tmp`;

			await mkdir(path.dirname(recoveredTarget), { recursive: true });
			await writeFile(recoveredTemp, '{"ok":true}\n', "utf8");
			await writeFile(invalidTemp, "{broken", "utf8");

			const result = await (
				mod.recoverWorkspaceTempFiles as (args: {
					workspaceRoot: string;
				}) => Promise<{
					recovered: number;
					deleted: number;
					scanned: number;
				}>
			)({
				workspaceRoot,
			});

			expect(result.recovered).toBeGreaterThanOrEqual(1);
			expect(result.deleted).toBeGreaterThanOrEqual(1);
			expect(result.scanned).toBeGreaterThanOrEqual(2);
			await expect(readFile(recoveredTarget, "utf8")).resolves.toBe(
				'{"ok":true}\n',
			);
			const bardoStateDir = await readdir(path.join(bardoRoot, "state"));
			expect(bardoStateDir.some((name) => name.endsWith(".tmp"))).toBe(false);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("requires an active subscription for remote tools", async () => {
		const access = createRemoteToolAccessController({
			plan: "free",
		});

		const visible = access.filterTools([{ name: "scene_turn" }]);

		expect(visible).toEqual([]);
		expect(access.isAllowed({ name: "scene_turn" })).toBe(false);
		expect(access.blockedMessage("scene_turn")).toContain(
			"active subscription",
		);
	});
});
