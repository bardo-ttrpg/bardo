import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseCliArgs, runCli } from "./runtime";

function createWriter() {
	let buffer = "";
	return {
		write(chunk: string) {
			buffer += chunk;
		},
		read() {
			return buffer;
		},
	};
}

async function createTempDir(prefix: string): Promise<string> {
	return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("bardo runtime", () => {
	test("treats legacy adapter flags as the mcp serve command", () => {
		const parsed = parseCliArgs([
			"--api-key",
			"test-key",
			"--url",
			"https://example.com/mcp",
		]);

		expect(parsed.command).toBe("mcp-serve");
		expect(parsed.options.apiKey).toBe("test-key");
		expect(parsed.options.url).toBe("https://example.com/mcp");
	});

	test("login stores config in the user config directory", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();

		try {
			const exitCode = await runCli(
				["login", "--api-key", "test-key", "--url", "https://example.com/mcp"],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout,
					stderr,
				},
			);

			expect(exitCode).toBe(0);
			expect(stderr.read()).toBe("");
			expect(stdout.read()).toContain("Saved Bardo credentials");

			const saved = JSON.parse(
				await readFile(path.join(homeDir, ".config/bardo/config.json"), "utf8"),
			) as {
				apiKey: string;
				url: string;
			};

			expect(saved.apiKey).toBe("test-key");
			expect(saved.url).toBe("https://example.com/mcp");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("login exchanges a website-issued token for runtime credentials", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();

		try {
			const exitCode = await runCli(
				[
					"login",
					"--token",
					"cli_login_token",
					"--exchange-url",
					"https://app.bardo.ai/api/connect/cli-exchange",
				],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout,
					stderr: createWriter(),
					fetch: async (input, init) => {
						expect(String(input)).toBe(
							"https://app.bardo.ai/api/connect/cli-exchange",
						);
						expect(init?.method).toBe("POST");
						expect(init?.body).toBe(
							JSON.stringify({ token: "cli_login_token" }),
						);
						return new Response(
							JSON.stringify({
								apiKey: "bardo_live_exchange",
								mcpUrl: "https://mcp.bardo.ai/mcp",
								statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
								serverName: "bardo",
								expiresAtISO: "2026-03-03T00:15:00.000Z",
							}),
							{
								status: 200,
								headers: { "content-type": "application/json" },
							},
						);
					},
				},
			);

			expect(exitCode).toBe(0);
			expect(stdout.read()).toContain("Saved Bardo credentials");

			const saved = JSON.parse(
				await readFile(path.join(homeDir, ".config/bardo/config.json"), "utf8"),
			) as {
				apiKey: string;
				url: string;
				serverName?: string;
				statusUrl?: string;
			};

			expect(saved.apiKey).toBe("bardo_live_exchange");
			expect(saved.url).toBe("https://mcp.bardo.ai/mcp");
			expect(saved.serverName).toBe("bardo");
			expect(saved.statusUrl).toBe(
				"https://app.bardo.ai/api/connect/runtime-status",
			);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("login can start a browser approval flow and poll until credentials are ready", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();
		let pollCount = 0;

		try {
			const exitCode = await runCli(["login"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr,
				env: {
					BARDO_LOGIN_START_URL:
						"https://app.bardo.ai/api/connect/cli-session/start",
				},
				sleep: async () => {},
				fetch: async (input, init) => {
					const url = String(input);
					if (url === "https://app.bardo.ai/api/connect/cli-session/start") {
						expect(init?.method).toBe("POST");
						return new Response(
							JSON.stringify({
								sessionId: "cli_session_123",
								userCode: "ABCD-1234",
								verificationUrl:
									"https://app.bardo.ai/dashboard/connect/cli/cli_session_123",
								pollUrl:
									"https://app.bardo.ai/api/connect/cli-session/poll?sessionId=cli_session_123&pollSecret=poll_secret_123",
								intervalMs: 1,
								expiresAtISO: "2099-03-03T00:10:00.000Z",
							}),
							{
								status: 200,
								headers: { "content-type": "application/json" },
							},
						);
					}
					if (
						url ===
						"https://app.bardo.ai/api/connect/cli-session/poll?sessionId=cli_session_123&pollSecret=poll_secret_123"
					) {
						pollCount += 1;
						if (pollCount === 1) {
							return new Response(
								JSON.stringify({
									status: "pending",
									intervalMs: 1,
								}),
								{
									status: 200,
									headers: { "content-type": "application/json" },
								},
							);
						}
						return new Response(
							JSON.stringify({
								status: "approved",
								apiKey: "bardo_live_device_flow",
								mcpUrl: "https://mcp.bardo.ai/mcp",
								statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
								serverName: "bardo",
								issuedAtISO: "2099-03-03T00:00:00.000Z",
								expiresAtISO: "2099-03-03T00:10:00.000Z",
							}),
							{
								status: 200,
								headers: { "content-type": "application/json" },
							},
						);
					}
					throw new Error(`Unexpected URL ${url}`);
				},
			});

			expect(exitCode).toBe(0);
			expect(stderr.read()).toBe("");
			expect(stdout.read()).toContain(
				"https://app.bardo.ai/dashboard/connect/cli/cli_session_123",
			);
			expect(stdout.read()).toContain("ABCD-1234");

			const saved = JSON.parse(
				await readFile(path.join(homeDir, ".config/bardo/config.json"), "utf8"),
			) as {
				apiKey: string;
				url: string;
				statusUrl?: string;
			};
			expect(saved.apiKey).toBe("bardo_live_device_flow");
			expect(saved.url).toBe("https://mcp.bardo.ai/mcp");
			expect(saved.statusUrl).toBe(
				"https://app.bardo.ai/api/connect/runtime-status",
			);
			expect(pollCount).toBe(2);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("logout removes the saved config file", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const configDir = path.join(homeDir, ".config/bardo");
		const configPath = path.join(configDir, "config.json");

		await mkdir(configDir, { recursive: true });
		await writeFile(
			configPath,
			JSON.stringify(
				{
					apiKey: "test-key",
					url: "https://example.com/mcp",
				},
				null,
				2,
			),
			"utf8",
		);

		try {
			const stdout = createWriter();
			const exitCode = await runCli(["logout"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr: createWriter(),
			});

			expect(exitCode).toBe(0);
			expect(stdout.read()).toContain("Removed saved Bardo credentials");
			await expect(readFile(configPath, "utf8")).rejects.toMatchObject({
				code: "ENOENT",
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("init scaffolds a canonical bardo workspace and imports a rulebook", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const rulebookPath = path.join(workspaceRoot, "shadowdark-rulebook.md");

		await writeFile(
			rulebookPath,
			"# Shadowdark\n\nCore rules for the campaign.",
			"utf8",
		);

		try {
			const stdout = createWriter();
			const exitCode = await runCli(
				["init", "--rulebook", rulebookPath, "--ruleset", "shadowdark"],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout,
					stderr: createWriter(),
				},
			);

			expect(exitCode).toBe(0);
			expect(stdout.read()).toContain("Initialized Bardo workspace");

			const bardoRoot = path.join(workspaceRoot, "bardo");
			const manifest = JSON.parse(
				await readFile(path.join(bardoRoot, "manifest.json"), "utf8"),
			) as {
				ruleset: string | null;
				workspaceRoot: string;
			};

			expect(manifest.ruleset).toBe("shadowdark");
			expect(manifest.workspaceRoot).toBe(workspaceRoot);

			await expect(
				readFile(
					path.join(bardoRoot, "rules/sources/rulebook/shadowdark-rulebook.md"),
					"utf8",
				),
			).resolves.toContain("Shadowdark");
			await expect(
				readFile(path.join(bardoRoot, "events/history.md"), "utf8"),
			).resolves.toContain("Campaign History");
			await expect(
				readFile(path.join(bardoRoot, "state/current.md"), "utf8"),
			).resolves.toContain("{}");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("doctor reports workspace, auth, and health connectivity as json", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();

		try {
			await runCli(
				["login", "--api-key", "test-key", "--url", "https://example.com/mcp"],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout: createWriter(),
					stderr: createWriter(),
				},
			);
			await runCli(["init"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: createWriter(),
				stderr: createWriter(),
			});

			const exitCode = await runCli(["doctor", "--json"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr: createWriter(),
				fetch: async () =>
					new Response(JSON.stringify({ ok: true }), {
						status: 200,
						headers: { "content-type": "application/json" },
					}),
			});

			expect(exitCode).toBe(0);
			const payload = JSON.parse(stdout.read()) as {
				auth: { configured: boolean; source: string };
				workspace: { bardoRoot: string; initialized: boolean };
				connectivity: { health: { ok: boolean; status: number } };
			};

			expect(payload.auth.configured).toBe(true);
			expect(payload.auth.source).toBe("config");
			expect(payload.workspace.initialized).toBe(true);
			expect(payload.workspace.bardoRoot).toBe(
				path.join(workspaceRoot, "bardo"),
			);
			expect(payload.connectivity.health.ok).toBe(true);
			expect(payload.connectivity.health.status).toBe(200);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("doctor fetches account status when a runtime status URL is configured", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "test-key",
						url: "https://mcp.bardo.ai/mcp",
						statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);

			const calls: Array<{ url: string; auth: string | null }> = [];
			const exitCode = await runCli(["doctor", "--json"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr: createWriter(),
				fetch: async (input, init) => {
					const url = String(input);
					calls.push({
						url,
						auth:
							init?.headers instanceof Headers
								? init.headers.get("authorization")
								: new Headers(init?.headers).get("authorization"),
					});
					if (url === "https://mcp.bardo.ai/health") {
						return new Response(JSON.stringify({ ok: true }), {
							status: 200,
							headers: { "content-type": "application/json" },
						});
					}
					if (url === "https://app.bardo.ai/api/connect/runtime-status") {
						return new Response(
							JSON.stringify({
								valid: true,
								subjectId: "user_123",
								keyId: "key_123",
								scopes: ["mcp"],
								workspacePath: "./customers/user_123",
								plan: "solo",
								mcpPeriodLimit: 25000,
								billingUnavailable: false,
							}),
							{
								status: 200,
								headers: { "content-type": "application/json" },
							},
						);
					}
					throw new Error(`Unexpected URL ${url}`);
				},
			});

			expect(exitCode).toBe(0);
			const payload = JSON.parse(stdout.read()) as {
				account: {
					fetched: boolean;
					ok: boolean;
					statusUrl: string | null;
					subjectId: string | null;
					keyId: string | null;
					plan: string | null;
					mcpPeriodLimit: number | null;
				};
			};

			expect(payload.account.fetched).toBe(true);
			expect(payload.account.ok).toBe(true);
			expect(payload.account.statusUrl).toBe(
				"https://app.bardo.ai/api/connect/runtime-status",
			);
			expect(payload.account.subjectId).toBe("user_123");
			expect(payload.account.keyId).toBe("key_123");
			expect(payload.account.plan).toBe("solo");
			expect(payload.account.mcpPeriodLimit).toBe(25000);
			expect(calls).toEqual([
				{
					url: "https://mcp.bardo.ai/health",
					auth: null,
				},
				{
					url: "https://app.bardo.ai/api/connect/runtime-status",
					auth: "Bearer test-key",
				},
			]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("mcp serve resolves the current plan from runtime status and forwards it to the local broker", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stderr = createWriter();

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "test-key",
						url: "https://mcp.bardo.ai/mcp",
						statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);

			let received:
				| {
						apiKey: string;
						url: string;
						workspaceRoot: string;
						plan?: string | null;
				  }
				| undefined;
			const exitCode = await runCli(["mcp", "serve"], {
				cwd: workspaceRoot,
				homeDir,
				stderr,
				stdout: createWriter(),
				startBridge: async (options) => {
					received = options as typeof received;
				},
				fetch: async (input, init) => {
					expect(String(input)).toBe(
						"https://app.bardo.ai/api/connect/runtime-status",
					);
					expect(new Headers(init?.headers).get("authorization")).toBe(
						"Bearer test-key",
					);
					return new Response(
						JSON.stringify({
							valid: true,
							plan: "solo_plus",
						}),
						{
							status: 200,
							headers: { "content-type": "application/json" },
						},
					);
				},
			});

			expect(exitCode).toBe(0);
			expect(received).toEqual({
				apiKey: "test-key",
				url: "https://mcp.bardo.ai/mcp",
				workspaceRoot,
				plan: "solo_plus",
			});
			expect(stderr.read()).toBe("");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("mcp serve falls back to an unknown plan when runtime status cannot be fetched", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stderr = createWriter();

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "test-key",
						url: "https://mcp.bardo.ai/mcp",
						statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);

			let receivedPlan = "unexpected";
			const exitCode = await runCli(["mcp", "serve"], {
				cwd: workspaceRoot,
				homeDir,
				stderr,
				stdout: createWriter(),
				startBridge: async (options) => {
					receivedPlan =
						(options as { plan?: string | null }).plan === undefined
							? "undefined"
							: String((options as { plan?: string | null }).plan);
				},
				fetch: async () =>
					new Response(JSON.stringify({ error: "boom" }), {
						status: 503,
						headers: { "content-type": "application/json" },
					}),
			});

			expect(exitCode).toBe(0);
			expect(receivedPlan).toBe("null");
			expect(stderr.read()).toContain("runtime status");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("install writes a workspace Codex config using saved credentials", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "bardo_live_saved",
						url: "https://mcp.bardo.ai/mcp",
						statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);

			const exitCode = await runCli(["install", "--client", "codex"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr: createWriter(),
			});

			expect(exitCode).toBe(0);
			expect(stdout.read()).toContain(".codex/config.toml");
			await expect(
				readFile(path.join(workspaceRoot, ".codex/config.toml"), "utf8"),
			).resolves.toContain("[mcp_servers.bardo]");
			await expect(
				readFile(path.join(workspaceRoot, ".codex/config.toml"), "utf8"),
			).resolves.toContain('"--workspace-root"');
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("install merges existing Cursor workspace config", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "bardo_live_saved",
						url: "https://mcp.bardo.ai/mcp",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);
			await mkdir(path.join(workspaceRoot, ".cursor"), { recursive: true });
			await writeFile(
				path.join(workspaceRoot, ".cursor/mcp.json"),
				JSON.stringify(
					{
						mcpServers: {
							existing: {
								command: "uvx",
								args: ["existing-tool"],
							},
						},
					},
					null,
					2,
				),
				"utf8",
			);

			const exitCode = await runCli(["install", "--client", "cursor"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: createWriter(),
				stderr: createWriter(),
			});

			expect(exitCode).toBe(0);
			const config = JSON.parse(
				await readFile(path.join(workspaceRoot, ".cursor/mcp.json"), "utf8"),
			) as {
				mcpServers: Record<string, { command: string; args: string[] }>;
			};
			expect(config.mcpServers.existing.command).toBe("uvx");
			expect(config.mcpServers.bardo.command).toBe("bunx");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("install writes a merge-safe Claude project config", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "bardo_live_saved",
						url: "https://mcp.bardo.ai/mcp",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, ".mcp.json"),
				JSON.stringify(
					{
						mcpServers: {
							existing: {
								command: "uvx",
								args: ["existing-tool"],
							},
						},
					},
					null,
					2,
				),
				"utf8",
			);

			const exitCode = await runCli(["install", "--client", "claude"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: createWriter(),
				stderr: createWriter(),
			});

			expect(exitCode).toBe(0);
			const config = JSON.parse(
				await readFile(path.join(workspaceRoot, ".mcp.json"), "utf8"),
			) as {
				mcpServers: Record<string, { command: string; args: string[] }>;
			};
			expect(config.mcpServers.existing.command).toBe("uvx");
			expect(config.mcpServers.bardo.command).toBe("bunx");
			expect(config.mcpServers.bardo.args).toContain("--workspace-root");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("install writes an OpenCode project config for remote mode", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "bardo_live_saved",
						url: "https://mcp.bardo.ai/mcp",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, "opencode.json"),
				JSON.stringify(
					{
						theme: "opencode",
						mcp: {
							existing: {
								type: "local",
								command: ["uvx", "existing-tool"],
								enabled: true,
							},
						},
					},
					null,
					2,
				),
				"utf8",
			);

			const exitCode = await runCli(
				["install", "--client", "opencode", "--mode", "remote"],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout: createWriter(),
					stderr: createWriter(),
				},
			);

			expect(exitCode).toBe(0);
			const config = JSON.parse(
				await readFile(path.join(workspaceRoot, "opencode.json"), "utf8"),
			) as {
				theme: string;
				mcp: Record<
					string,
					{
						type: string;
						url?: string;
						headers?: Record<string, string>;
						command?: string[];
						enabled?: boolean;
					}
				>;
			};
			expect(config.theme).toBe("opencode");
			expect(config.mcp.existing.command).toEqual(["uvx", "existing-tool"]);
			expect(config.mcp.bardo).toEqual({
				type: "remote",
				url: "https://mcp.bardo.ai/mcp",
				headers: {
					Authorization: "Bearer bardo_live_saved",
				},
				enabled: true,
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("export copies the bardo workspace into the target directory", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const exportRoot = await createTempDir("bardo-export-");

		try {
			await runCli(["init", "--ruleset", "shadowdark"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: createWriter(),
				stderr: createWriter(),
			});

			const exitCode = await runCli(["export", "--output", exportRoot], {
				cwd: workspaceRoot,
				homeDir,
				stdout: createWriter(),
				stderr: createWriter(),
			});

			expect(exitCode).toBe(0);
			await expect(
				readFile(path.join(exportRoot, "bardo/manifest.json"), "utf8"),
			).resolves.toContain('"ruleset": "shadowdark"');
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
			await rm(exportRoot, { recursive: true, force: true });
		}
	});

	test("pack-debug writes a redacted support bundle", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const outputPath = path.join(workspaceRoot, "bardo-debug.json");

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "bardo_live_saved_secret",
						url: "https://mcp.bardo.ai/mcp",
						statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);
			await runCli(["init"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: createWriter(),
				stderr: createWriter(),
			});

			const exitCode = await runCli(["pack-debug", "--output", outputPath], {
				cwd: workspaceRoot,
				homeDir,
				stdout: createWriter(),
				stderr: createWriter(),
				fetch: async (input) => {
					const url = String(input);
					if (url === "https://mcp.bardo.ai/health") {
						return new Response(JSON.stringify({ ok: true }), {
							status: 200,
							headers: { "content-type": "application/json" },
						});
					}
					if (url === "https://app.bardo.ai/api/connect/runtime-status") {
						return new Response(
							JSON.stringify({
								valid: true,
								subjectId: "user_123",
								keyId: "key_123",
								scopes: ["mcp"],
								workspacePath: "./customers/user_123",
								plan: "solo",
								mcpPeriodLimit: 25000,
								billingUnavailable: false,
							}),
							{
								status: 200,
								headers: { "content-type": "application/json" },
							},
						);
					}
					throw new Error(`Unexpected URL ${url}`);
				},
			});

			expect(exitCode).toBe(0);
			const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
				config: { apiKeyPreview: string; apiKeyRedacted: boolean };
				doctor: { account: { plan: string | null } };
			};
			expect(payload.config.apiKeyRedacted).toBe(true);
			expect(payload.config.apiKeyPreview).toContain("bardo_live");
			expect(payload.doctor.account.plan).toBe("solo");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});
});
