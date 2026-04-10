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
				version: number;
				apiKey: string;
				url: string;
				statusUrl?: string;
			};

			expect(saved.version).toBe(1);
			expect(saved.apiKey).toBe("test-key");
			expect(saved.url).toBe("https://example.com/mcp");
			expect(saved.statusUrl).toBe(
				"https://www.bardo.gg/api/connect/runtime-status",
			);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("subcommand help flags render help instead of executing the command", async () => {
		const stdout = createWriter();
		const stderr = createWriter();

		const exitCode = await runCli(["login", "--help"], {
			stdout,
			stderr,
			fetch: async () => {
				throw new Error("login --help should not trigger network calls");
			},
		});

		expect(exitCode).toBe(0);
		expect(stderr.read()).toBe("");
		expect(stdout.read()).toContain("Usage:");
		expect(stdout.read()).toContain("bardo login");
	});

	test("login stores config under XDG_CONFIG_HOME when it is set", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const xdgConfigHome = path.join(homeDir, ".xdg-config");

		try {
			const exitCode = await runCli(
				["login", "--api-key", "test-key", "--url", "https://example.com/mcp"],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout: createWriter(),
					stderr: createWriter(),
					env: {
						HOME: homeDir,
						XDG_CONFIG_HOME: xdgConfigHome,
					},
				},
			);

			expect(exitCode).toBe(0);
			await expect(
				readFile(path.join(xdgConfigHome, "bardo/config.json"), "utf8"),
			).resolves.toContain('"apiKey": "test-key"');
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("login honors BARDO_API_KEY in headless environments", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		let fetchCalled = false;

		try {
			const exitCode = await runCli(
				["login", "--url", "https://example.com/mcp"],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout: createWriter(),
					stderr: createWriter(),
					env: {
						BARDO_API_KEY: "bardo_live_env_headless",
					},
					fetch: async () => {
						fetchCalled = true;
						throw new Error("Interactive login should not run");
					},
				},
			);

			expect(exitCode).toBe(0);
			expect(fetchCalled).toBe(false);

			const saved = JSON.parse(
				await readFile(path.join(homeDir, ".config/bardo/config.json"), "utf8"),
			) as {
				version: number;
				apiKey: string;
				url: string;
			};

			expect(saved).toMatchObject({
				version: 1,
				apiKey: "bardo_live_env_headless",
				url: "https://example.com/mcp",
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("login with --api-key drops stale bridge refresh credentials from an existing v2 config", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const configPath = path.join(homeDir, ".config/bardo/config.json");

		try {
			await mkdir(path.dirname(configPath), { recursive: true });
			await writeFile(
				configPath,
				JSON.stringify(
					{
						version: 2,
						accessToken: "bridge-access-token",
						refreshToken: "stale-refresh-token",
						expiresAtISO: "2026-03-21T00:00:00.000Z",
						url: "https://old.example.com/mcp",
						statusUrl: "https://old.example.com/api/connect/runtime-status",
						refreshUrl:
							"https://old.example.com/api/connect/bridge-session/refresh",
						accountLabel: "Old Account",
						plan: "solo",
						updatedAtISO: "2026-03-20T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);

			const exitCode = await runCli(
				[
					"login",
					"--api-key",
					"manual-static-key",
					"--url",
					"https://example.com/mcp",
				],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout: createWriter(),
					stderr: createWriter(),
				},
			);

			expect(exitCode).toBe(0);

			const saved = JSON.parse(await readFile(configPath, "utf8")) as Record<
				string,
				unknown
			>;
			expect(saved).toMatchObject({
				version: 1,
				apiKey: "manual-static-key",
				url: "https://example.com/mcp",
			});
			expect(saved.refreshToken).toBeUndefined();
			expect(saved.expiresAtISO).toBeUndefined();
			expect(saved.refreshUrl).toBeUndefined();
			expect(saved.accountLabel).toBeUndefined();
			expect(saved.plan).toBeUndefined();
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("login derives a runtime status URL from the configured website service when saving an API key", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");

		try {
			const exitCode = await runCli(
				[
					"login",
					"--api-key",
					"test-key",
					"--url",
					"https://mcp-staging.example.com/mcp",
				],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout: createWriter(),
					stderr: createWriter(),
					env: {
						BARDO_LOGIN_START_URL:
							"https://staging.bardo.ai/api/connect/bridge-session/start",
					},
				},
			);

			expect(exitCode).toBe(0);

			const saved = JSON.parse(
				await readFile(path.join(homeDir, ".config/bardo/config.json"), "utf8"),
			) as {
				statusUrl?: string;
			};

			expect(saved.statusUrl).toBe(
				"https://staging.bardo.ai/api/connect/runtime-status",
			);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("doctor reads legacy versionless configs through the v1 migration path", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();

		try {
			const configPath = path.join(homeDir, ".config/bardo/config.json");
			await mkdir(path.dirname(configPath), { recursive: true });
			await writeFile(
				configPath,
				JSON.stringify({
					apiKey: "legacy-key",
					url: "https://example.com/mcp",
					updatedAtISO: "2026-03-04T00:00:00.000Z",
				}),
				"utf8",
			);

			const exitCode = await runCli(["doctor", "--json"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr,
				fetch: async (input) => {
					if (String(input) === "https://example.com/health") {
						return new Response("ok", { status: 200 });
					}
					if (String(input) === "https://example.com/mcp") {
						throw new Error("Unexpected MCP fetch");
					}
					return new Response("ok", { status: 200 });
				},
			});

			expect(exitCode).toBe(0);
			expect(stderr.read()).toBe("");
			const output = JSON.parse(stdout.read()) as {
				auth: { configured: boolean; source: string; url: string | null };
			};
			expect(output.auth.configured).toBe(true);
			expect(output.auth.source).toBe("config");
			expect(output.auth.url).toBe("https://example.com/mcp");
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
						"https://www.bardo.gg/api/connect/bridge-session/start",
				},
				sleep: async () => {},
				fetch: async (input, init) => {
					const url = String(input);
					if (url === "https://www.bardo.gg/api/connect/bridge-session/start") {
						expect(init?.method).toBe("POST");
						return new Response(
							JSON.stringify({
								sessionId: "cli_session_123",
								userCode: "ABCD-1234",
								verificationUrl:
									"https://www.bardo.gg/dashboard/connect/bridge/cli_session_123",
								pollUrl:
									"https://www.bardo.gg/api/connect/bridge-session/poll?sessionId=cli_session_123&pollSecret=poll_secret_123",
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
						"https://www.bardo.gg/api/connect/bridge-session/poll?sessionId=cli_session_123&pollSecret=poll_secret_123"
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
								accessToken: "bardo_bridge_access_device_flow",
								refreshToken: "bardo_bridge_refresh_device_flow",
								expiresAt: "2099-03-03T00:10:00.000Z",
								mcpUrl: "http://127.0.0.1:3000/mcp",
								statusUrl: "https://www.bardo.gg/api/connect/runtime-status",
								refreshUrl:
									"https://www.bardo.gg/api/connect/bridge-session/refresh",
								accountLabel: "Armando",
								plan: "solo",
								serverName: "bardo",
								issuedAtISO: "2099-03-03T00:00:00.000Z",
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
				"https://www.bardo.gg/dashboard/connect/bridge/cli_session_123",
			);
			expect(stdout.read()).toContain("ABCD-1234");

			const saved = JSON.parse(
				await readFile(path.join(homeDir, ".config/bardo/config.json"), "utf8"),
			) as {
				version: number;
				accessToken: string;
				refreshToken: string;
				expiresAtISO: string;
				url: string;
				statusUrl?: string;
				refreshUrl?: string;
				accountLabel?: string;
				plan?: string;
			};
			expect(saved.version).toBe(2);
			expect(saved.accessToken).toBe("bardo_bridge_access_device_flow");
			expect(saved.refreshToken).toBe("bardo_bridge_refresh_device_flow");
			expect(saved.expiresAtISO).toBe("2099-03-03T00:10:00.000Z");
			expect(saved.url).toBe("http://127.0.0.1:3000/mcp");
			expect(saved.statusUrl).toBe(
				"https://www.bardo.gg/api/connect/runtime-status",
			);
			expect(saved.refreshUrl).toBe(
				"https://www.bardo.gg/api/connect/bridge-session/refresh",
			);
			expect(saved.accountLabel).toBe("Armando");
			expect(saved.plan).toBe("solo");
			expect(pollCount).toBe(2);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("login preserves the CLI start-url loopback host for saved bridge status endpoints", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");

		try {
			const exitCode = await runCli(["login"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: createWriter(),
				stderr: createWriter(),
				env: {
					BARDO_LOGIN_START_URL:
						"http://127.0.0.1:3001/api/connect/bridge-session/start",
				},
				sleep: async () => {},
				fetch: async (input) => {
					const url = String(input);
					if (
						url === "http://127.0.0.1:3001/api/connect/bridge-session/start"
					) {
						return new Response(
							JSON.stringify({
								sessionId: "cli_session_loopback",
								userCode: "LPBK-1234",
								verificationUrl:
									"http://127.0.0.1:3001/dashboard/connect/bridge/cli_session_loopback",
								pollUrl:
									"http://127.0.0.1:3001/api/connect/bridge-session/poll?sessionId=cli_session_loopback&pollSecret=poll_secret_loopback",
								intervalMs: 1,
							}),
							{
								status: 200,
								headers: { "content-type": "application/json" },
							},
						);
					}
					if (
						url ===
						"http://127.0.0.1:3001/api/connect/bridge-session/poll?sessionId=cli_session_loopback&pollSecret=poll_secret_loopback"
					) {
						return new Response(
							JSON.stringify({
								status: "approved",
								accessToken: "loopback_access_token",
								refreshToken: "loopback_refresh_token",
								expiresAt: "2099-03-03T00:10:00.000Z",
								mcpUrl: "http://127.0.0.1:3000/mcp",
								statusUrl: "http://localhost:3001/api/connect/runtime-status",
								refreshUrl:
									"http://localhost:3001/api/connect/bridge-session/refresh",
								accountLabel: "Armando",
								plan: "solo",
								serverName: "bardo",
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
			const saved = JSON.parse(
				await readFile(path.join(homeDir, ".config/bardo/config.json"), "utf8"),
			) as {
				url: string;
				statusUrl?: string;
				refreshUrl?: string;
			};

			expect(saved.url).toBe("http://127.0.0.1:3000/mcp");
			expect(saved.statusUrl).toBe(
				"http://127.0.0.1:3001/api/connect/runtime-status",
			);
			expect(saved.refreshUrl).toBe(
				"http://127.0.0.1:3001/api/connect/bridge-session/refresh",
			);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("login surfaces an actionable error when the website runtime status service is unreachable", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();

		try {
			const exitCode = await runCli(["login"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr,
				env: {
					BARDO_LOGIN_START_URL:
						"http://127.0.0.1:3001/api/connect/bridge-session/start",
				},
				fetch: async () => {
					throw new TypeError("fetch failed");
				},
			});

			expect(exitCode).toBe(1);
			expect(stdout.read()).toBe("");
			expect(stderr.read()).toContain(
				"Could not reach the Bardo website runtime status service",
			);
			expect(stderr.read()).toContain(
				"http://127.0.0.1:3001/api/connect/bridge-session/start",
			);
			expect(stderr.read()).toContain("bun run dev:website");
			expect(stderr.read()).toContain("bardo login --api-key");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("login accepts a legacy approved payload during browser approval", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();

		try {
			const exitCode = await runCli(["login"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr,
				env: {
					BARDO_LOGIN_START_URL:
						"https://www.bardo.gg/api/connect/bridge-session/start",
				},
				sleep: async () => {},
				fetch: async (input) => {
					const url = String(input);
					if (url === "https://www.bardo.gg/api/connect/bridge-session/start") {
						return new Response(
							JSON.stringify({
								sessionId: "cli_session_legacy",
								userCode: "LEGC-Y123",
								verificationUrl:
									"https://www.bardo.gg/dashboard/connect/bridge/cli_session_legacy",
								pollUrl:
									"https://www.bardo.gg/api/connect/bridge-session/poll?sessionId=cli_session_legacy&pollSecret=poll_secret_legacy",
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
						"https://www.bardo.gg/api/connect/bridge-session/poll?sessionId=cli_session_legacy&pollSecret=poll_secret_legacy"
					) {
						return new Response(
							JSON.stringify({
								status: "approved",
								apiKey: "legacy_bridge_token",
								mcpUrl: "http://127.0.0.1:3100/mcp",
								statusUrl: "http://127.0.0.1:3001/api/connect/runtime-status",
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
			const saved = JSON.parse(
				await readFile(path.join(homeDir, ".config/bardo/config.json"), "utf8"),
			) as {
				version: number;
				apiKey?: string;
				url?: string;
				statusUrl?: string;
				serverName?: string;
			};

			expect(saved.version).toBe(1);
			expect(saved.apiKey).toBe("legacy_bridge_token");
			expect(saved.url).toBe("http://127.0.0.1:3100/mcp");
			expect(saved.statusUrl).toBe(
				"http://127.0.0.1:3001/api/connect/runtime-status",
			);
			expect(saved.serverName).toBe("bardo");
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

	test("init scaffolds the canonical .bardo workspace and imports a rulebook", async () => {
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

			const bardoRoot = path.join(workspaceRoot, ".bardo");
			const manifest = JSON.parse(
				await readFile(path.join(bardoRoot, "manifest.json"), "utf8"),
			) as {
				ruleset: string | null;
				workspaceRoot: string;
			};

			expect(manifest.ruleset).toBe("shadowdark");
			expect(manifest.workspaceRoot).toBe(workspaceRoot);

			await expect(
				readFile(path.join(bardoRoot, "rules/rulebook.md"), "utf8"),
			).resolves.toContain("Shadowdark");
			await expect(
				readFile(path.join(bardoRoot, "docs/quickstart.md"), "utf8"),
			).resolves.toContain("state/current-state.json");
			await expect(
				readFile(path.join(bardoRoot, "docs/credits-and-billing.md"), "utf8"),
			).resolves.toContain("1 accepted MCP tool call = 1 credit");
			await expect(
				readFile(path.join(bardoRoot, "rules/normalized/index.json"), "utf8"),
			).resolves.toContain('"recommendedSimulationDepth"');
			await expect(
				readFile(path.join(bardoRoot, "manifests/source-index.json"), "utf8"),
			).resolves.toContain('"sources"');
			await expect(
				readFile(path.join(bardoRoot, "manifests/readiness.json"), "utf8"),
			).resolves.toContain('"status"');
			await expect(
				readFile(path.join(bardoRoot, "events/state-changes.ndjson"), "utf8"),
			).resolves.toBe("");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("init auto-imports workspace-root rulebook.md when --rulebook is omitted", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const rulebookPath = path.join(workspaceRoot, "rulebook.md");

		await writeFile(
			rulebookPath,
			"# Workspace Rulebook\n\nConverted markdown source.",
			"utf8",
		);

		try {
			const stdout = createWriter();
			const stderr = createWriter();
			const exitCode = await runCli(["init"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr,
			});

			expect(exitCode).toBe(0);
			expect(stderr.read()).toBe("");
			await expect(
				readFile(path.join(workspaceRoot, ".bardo/rules/rulebook.md"), "utf8"),
			).resolves.toContain("Workspace Rulebook");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("init fails when neither --rulebook nor workspace-root rulebook.md is present", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");

		try {
			const stdout = createWriter();
			const stderr = createWriter();
			const exitCode = await runCli(["init"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr,
			});

			expect(exitCode).toBe(1);
			expect(stdout.read()).toBe("");
			expect(stderr.read()).toContain("rulebook.md");
			await expect(
				readFile(path.join(workspaceRoot, ".bardo/rules/rulebook.md"), "utf8"),
			).rejects.toMatchObject({
				code: "ENOENT",
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("init rejects PDF rulebook imports and asks for markdown conversion", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const rulebookPath = path.join(workspaceRoot, "shadowdark-rulebook.pdf");

		await writeFile(rulebookPath, "%PDF-not-really", "utf8");

		try {
			const stdout = createWriter();
			const stderr = createWriter();
			const exitCode = await runCli(["init", "--rulebook", rulebookPath], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr,
			});

			expect(exitCode).toBe(1);
			expect(stderr.read()).toContain("Convert PDFs to Markdown");
			await expect(
				readFile(path.join(workspaceRoot, ".bardo/rules/rulebook.pdf"), "utf8"),
			).rejects.toMatchObject({
				code: "ENOENT",
			});
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
			await writeFile(
				path.join(workspaceRoot, "rulebook.md"),
				"# Workspace Rulebook\n\nConverted markdown source.",
				"utf8",
			);
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
				path.join(workspaceRoot, ".bardo"),
			);
			expect(payload.connectivity.health.ok).toBe(true);
			expect(payload.connectivity.health.status).toBe(200);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("clients list prints supported client metadata as json", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();

		try {
			const exitCode = await runCli(["clients", "list", "--json"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr: createWriter(),
			});

			expect(exitCode).toBe(0);
			const payload = JSON.parse(stdout.read()) as Array<{
				id: string;
				label: string;
				tier: string;
				autoInstall: boolean;
				defaultConfigPath: string | null;
				supportsLocal: boolean;
				supportsRemote: boolean;
			}>;

			expect(payload.some((client) => client.id === "kiro")).toBe(true);
			expect(payload.some((client) => client.id === "kilo")).toBe(true);
			expect(payload.some((client) => client.id === "gemini")).toBe(true);
			expect(payload.some((client) => client.id === "generic")).toBe(true);
			expect(payload.find((client) => client.id === "vscode")).toMatchObject({
				id: "vscode",
				label: "VS Code / GitHub Copilot",
				tier: "tier1",
				autoInstall: true,
				defaultConfigPath: ".vscode/settings.json",
				supportsLocal: true,
				supportsRemote: false,
			});
			expect(payload.find((client) => client.id === "gemini")).toMatchObject({
				id: "gemini",
				label: "Gemini CLI",
				tier: "tier1",
				autoInstall: true,
				defaultConfigPath: ".gemini/settings.json",
				supportsLocal: true,
				supportsRemote: false,
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("doctor can auto-detect the client from an existing workspace config", async () => {
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
						url: "http://127.0.0.1:3000/mcp",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);
			await runCli(["install", "--client", "kiro"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: createWriter(),
				stderr: createWriter(),
			});

			const exitCode = await runCli(["doctor", "--client", "auto", "--json"], {
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
				client: { id: string; label: string };
			};
			expect(payload.client).toMatchObject({
				id: "kiro",
				label: "Kiro",
			});
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
						url: "http://127.0.0.1:3000/mcp",
						statusUrl: "https://www.bardo.gg/api/connect/runtime-status",
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
					if (url === "http://127.0.0.1:3000/health") {
						return new Response(JSON.stringify({ ok: true }), {
							status: 200,
							headers: { "content-type": "application/json" },
						});
					}
					if (url === "https://www.bardo.gg/api/connect/runtime-status") {
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
				"https://www.bardo.gg/api/connect/runtime-status",
			);
			expect(payload.account.subjectId).toBe("user_123");
			expect(payload.account.keyId).toBe("key_123");
			expect(payload.account.plan).toBe("solo");
			expect(payload.account.mcpPeriodLimit).toBe(25000);
			expect(calls).toEqual([
				{
					url: "http://127.0.0.1:3000/health",
					auth: null,
				},
				{
					url: "https://www.bardo.gg/api/connect/runtime-status",
					auth: "Bearer test-key",
				},
				{
					url: "https://www.bardo.gg/api/connect/runtime-status",
					auth: null,
				},
			]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("doctor prefers the saved config status URL over the default website fallback", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "local-bridge-token",
						url: "http://127.0.0.1:3100/mcp",
						statusUrl: "http://127.0.0.1:3001/api/connect/runtime-status",
						updatedAtISO: "2026-03-17T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);

			const calls: string[] = [];
			const exitCode = await runCli(["doctor", "--json"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr: createWriter(),
				fetch: async (input) => {
					const url = String(input);
					calls.push(url);
					if (url === "http://127.0.0.1:3100/health") {
						return new Response(JSON.stringify({ ok: true }), {
							status: 200,
							headers: { "content-type": "application/json" },
						});
					}
					if (url === "http://127.0.0.1:3001/api/connect/runtime-status") {
						return new Response(
							JSON.stringify({
								valid: true,
								subjectId: "user_local",
								keyId: "bridge:local",
								scopes: ["mcp"],
								workspacePath: null,
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
				auth: { statusUrl: string | null };
				account: { ok: boolean; statusUrl: string | null };
			};
			expect(payload.auth.statusUrl).toBe(
				"http://127.0.0.1:3001/api/connect/runtime-status",
			);
			expect(payload.account.ok).toBe(true);
			expect(payload.account.statusUrl).toBe(
				"http://127.0.0.1:3001/api/connect/runtime-status",
			);
			expect(calls).not.toContain(
				"https://www.bardo.gg/api/connect/runtime-status",
			);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("doctor reports website reachability even before login is configured", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();

		try {
			const exitCode = await runCli(["doctor", "--json"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr: createWriter(),
				env: {
					BARDO_MCP_URL: "http://127.0.0.1:3000/mcp",
					BARDO_RUNTIME_STATUS_URL:
						"http://127.0.0.1:3001/api/connect/runtime-status",
				},
				fetch: async (input) => {
					const url = String(input);
					if (url === "http://127.0.0.1:3000/health") {
						return new Response(JSON.stringify({ ok: true }), {
							status: 200,
							headers: { "content-type": "application/json" },
						});
					}
					if (url === "http://127.0.0.1:3001/api/connect/runtime-status") {
						return new Response(JSON.stringify({ error: "Missing API key." }), {
							status: 401,
							headers: { "content-type": "application/json" },
						});
					}
					throw new Error(`Unexpected URL ${url}`);
				},
			});

			expect(exitCode).toBe(1);
			const payload = JSON.parse(stdout.read()) as {
				connectivity: {
					websiteBackend: {
						url: string | null;
						reachable: boolean;
						status: number | null;
						error: string | null;
					};
				};
				account: { fetched: boolean; error: string | null };
			};

			expect(payload.connectivity.websiteBackend).toEqual({
				url: "http://127.0.0.1:3001/api/connect/runtime-status",
				reachable: true,
				status: 401,
				error: null,
			});
			expect(payload.account.fetched).toBe(false);
			expect(payload.account.error).toBe("Missing API key.");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("doctor times out stale network probes instead of hanging indefinitely", async () => {
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
						url: "https://stale.example.com/mcp",
						statusUrl: "https://stale.example.com/api/connect/runtime-status",
						updatedAtISO: "2026-03-19T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);

			const neverResolvingFetch: typeof fetch = async (_input, init) =>
				new Promise<Response>((_, reject) => {
					init?.signal?.addEventListener("abort", () => {
						reject(new DOMException("Aborted", "AbortError"));
					});
				});

			const exitCode = await runCli(["doctor", "--json"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr: createWriter(),
				env: {
					BARDO_DOCTOR_TIMEOUT_MS: "100",
				},
				fetch: neverResolvingFetch,
			});

			expect(exitCode).toBe(1);
			const payload = JSON.parse(stdout.read()) as {
				connectivity: {
					health: { ok: boolean; error: string | null };
					websiteBackend: { reachable: boolean; error: string | null };
				};
				account: { ok: boolean; error: string | null };
			};

			expect(payload.connectivity.health.ok).toBe(false);
			expect(payload.connectivity.health.error).toContain("timed out");
			expect(payload.connectivity.websiteBackend.reachable).toBe(false);
			expect(payload.connectivity.websiteBackend.error).toContain("timed out");
			expect(payload.account.ok).toBe(false);
			expect(payload.account.error).toContain("timed out");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("doctor treats generic manual clients as informational rather than failing health", async () => {
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
						url: "http://127.0.0.1:3000/mcp",
						statusUrl: "https://www.bardo.gg/api/connect/runtime-status",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);

			const exitCode = await runCli(
				["doctor", "--client", "generic", "--json"],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout,
					stderr: createWriter(),
					fetch: async (input, init) => {
						const url = String(input);
						if (url === "http://127.0.0.1:3000/health") {
							return new Response(JSON.stringify({ ok: true }), {
								status: 200,
								headers: { "content-type": "application/json" },
							});
						}
						if (url === "https://www.bardo.gg/api/connect/runtime-status") {
							if (new Headers(init?.headers).get("authorization")) {
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
							return new Response(
								JSON.stringify({ error: "Missing API key." }),
								{
									status: 401,
									headers: { "content-type": "application/json" },
								},
							);
						}
						throw new Error(`Unexpected URL ${url}`);
					},
				},
			);

			expect(exitCode).toBe(0);
			const payload = JSON.parse(stdout.read()) as {
				client: {
					id: string;
					autoInstall: boolean;
					configPath: string | null;
					error: string | null;
				};
			};
			expect(payload.client).toMatchObject({
				id: "generic",
				autoInstall: false,
				configPath: null,
			});
			expect(payload.client.error).toBeNull();
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("doctor reports client config status for a selected client", async () => {
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
						url: "http://127.0.0.1:3000/mcp",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);
			await runCli(["install", "--client", "kiro"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: createWriter(),
				stderr: createWriter(),
			});

			const exitCode = await runCli(["doctor", "--client", "kiro", "--json"], {
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
				client: {
					id: string;
					label: string;
					configPath: string | null;
					configExists: boolean;
					autoInstall: boolean;
				};
			};

			expect(payload.client).toMatchObject({
				id: "kiro",
				label: "Kiro",
				autoInstall: true,
				configExists: true,
				configPath: path.join(workspaceRoot, ".kiro/settings/mcp.json"),
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("doctor recognizes client configs installed with a custom server name", async () => {
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
						url: "http://127.0.0.1:3000/mcp",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);
			await runCli(
				["install", "--client", "kiro", "--server-name", "campaign-gm"],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout: createWriter(),
					stderr: createWriter(),
				},
			);

			const exitCode = await runCli(["doctor", "--client", "kiro", "--json"], {
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
				client: {
					id: string;
					configValid: boolean;
					hasBardoServer: boolean;
					error: string | null;
				};
			};

			expect(payload.client).toMatchObject({
				id: "kiro",
				configValid: true,
				hasBardoServer: true,
			});
			expect(payload.client.error).toBeNull();
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("doctor recognizes Codex configs even when the Bardo table contains blank lines", async () => {
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
						url: "http://127.0.0.1:3000/mcp",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);
			await mkdir(path.join(workspaceRoot, ".codex"), { recursive: true });
			await writeFile(
				path.join(workspaceRoot, ".codex/config.toml"),
				`[mcp_servers.bardo]

url = "http://127.0.0.1:3000/mcp"
http_headers = { Authorization = "Bearer bardo_live_saved" }
`,
				"utf8",
			);

			const exitCode = await runCli(["doctor", "--client", "codex", "--json"], {
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
				client: {
					id: string;
					configValid: boolean;
					hasBardoServer: boolean;
					error: string | null;
				};
			};

			expect(payload.client).toMatchObject({
				id: "codex",
				configValid: true,
				hasBardoServer: true,
			});
			expect(payload.client.error).toBeNull();
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("doctor does not treat regex-like URL matches as Bardo Codex entries", async () => {
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
						url: "http://127.0.0.1:3000/mcp",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);
			await mkdir(path.join(workspaceRoot, ".codex"), { recursive: true });
			await writeFile(
				path.join(workspaceRoot, ".codex/config.toml"),
				`[mcp_servers.other]
url = "https://mcpXbardoYai/mcp"
http_headers = { Authorization = "Bearer bardo_live_saved" }
`,
				"utf8",
			);

			const exitCode = await runCli(["doctor", "--client", "codex", "--json"], {
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

			expect(exitCode).toBe(1);
			const payload = JSON.parse(stdout.read()) as {
				client: {
					id: string;
					configValid: boolean;
					hasBardoServer: boolean;
					error: string | null;
					warning: string | null;
				};
			};

			expect(payload.client).toMatchObject({
				id: "codex",
				configValid: true,
				hasBardoServer: false,
				warning: null,
			});
			expect(payload.client.error).toBe("Bardo server entry was not found.");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("doctor keeps detecting remote JSON Bardo entries when the saved URL changed", async () => {
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
						url: "https://mcp-new.bardo.ai/mcp",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);
			await mkdir(path.join(workspaceRoot, ".kiro/settings"), {
				recursive: true,
			});
			await writeFile(
				path.join(workspaceRoot, ".kiro/settings/mcp.json"),
				JSON.stringify(
					{
						mcpServers: {
							bardo: {
								url: "https://mcp-old.bardo.ai/mcp",
								headers: {
									Authorization: "Bearer bardo_live_saved",
								},
							},
						},
					},
					null,
					2,
				),
				"utf8",
			);

			const exitCode = await runCli(["doctor", "--client", "kiro", "--json"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr: createWriter(),
				fetch: async (input) => {
					if (String(input) === "https://mcp-new.bardo.ai/health") {
						return new Response(JSON.stringify({ ok: true }), {
							status: 200,
							headers: { "content-type": "application/json" },
						});
					}
					throw new Error(`Unexpected URL ${String(input)}`);
				},
			});

			expect(exitCode).toBe(0);
			const payload = JSON.parse(stdout.read()) as {
				client: {
					id: string;
					configValid: boolean;
					hasBardoServer: boolean;
					error: string | null;
					warning: string | null;
				};
			};

			expect(payload.client).toMatchObject({
				id: "kiro",
				configValid: true,
				hasBardoServer: true,
				error: null,
			});
			expect(payload.client.warning).toContain("https://mcp-old.bardo.ai/mcp");
			expect(payload.client.warning).toContain("https://mcp-new.bardo.ai/mcp");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("doctor reports malformed client config as invalid", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();

		try {
			await mkdir(path.join(workspaceRoot, ".kiro/settings"), {
				recursive: true,
			});
			await writeFile(
				path.join(workspaceRoot, ".kiro/settings/mcp.json"),
				"{invalid-json",
				"utf8",
			);

			const exitCode = await runCli(["doctor", "--client", "kiro", "--json"], {
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

			expect(exitCode).toBe(1);
			const payload = JSON.parse(stdout.read()) as {
				client: {
					id: string;
					configExists: boolean;
					configValid: boolean;
					hasBardoServer: boolean;
					error: string | null;
				};
			};

			expect(payload.client).toMatchObject({
				id: "kiro",
				configExists: true,
				configValid: false,
				hasBardoServer: false,
			});
			expect(payload.client.error).toContain("Invalid");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("doctor reports malformed MCP URLs as health errors instead of throwing", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();

		try {
			const exitCode = await runCli(["doctor", "--json"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr,
				env: {
					BARDO_MCP_URL: "::not-a-url::",
				},
				fetch: async (input) => {
					throw new Error(
						`Unexpected fetch for malformed URL: ${String(input)}`,
					);
				},
			});

			expect(exitCode).toBe(1);
			expect(stderr.read()).toBe("");
			const payload = JSON.parse(stdout.read()) as {
				connectivity: {
					health: {
						url: string | null;
						ok: boolean;
						status: number | null;
						error: string | null;
					};
				};
			};

			expect(payload.connectivity.health).toEqual({
				url: null,
				ok: false,
				status: null,
				error: "MCP URL is not a valid URL: ::not-a-url::",
			});
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
						url: "http://127.0.0.1:3000/mcp",
						statusUrl: "https://www.bardo.gg/api/connect/runtime-status",
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
						"https://www.bardo.gg/api/connect/runtime-status",
					);
					expect(new Headers(init?.headers).get("authorization")).toBe(
						"Bearer test-key",
					);
					return new Response(
						JSON.stringify({
							valid: true,
							plan: "solo",
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
				url: "http://127.0.0.1:3000/mcp",
				workspaceRoot,
				plan: "solo",
			});
			expect(stderr.read()).toBe("");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("mcp serve refreshes expired bridge credentials before starting the local broker", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stderr = createWriter();

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						version: 2,
						accessToken: "expired-access-token",
						refreshToken: "refresh-token",
						expiresAtISO: "2026-03-03T00:00:00.000Z",
						url: "http://127.0.0.1:3000/mcp",
						statusUrl: "http://localhost:3001/api/connect/runtime-status",
						refreshUrl:
							"http://localhost:3001/api/connect/bridge-session/refresh",
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
				now: () => new Date("2026-03-03T00:20:00.000Z"),
				startBridge: async (options) => {
					received = options as typeof received;
				},
				fetch: async (input, init) => {
					if (
						String(input) ===
						"http://127.0.0.1:3001/api/connect/bridge-session/refresh"
					) {
						expect(await new Response(init?.body).text()).toContain(
							"refresh-token",
						);
						return new Response(
							JSON.stringify({
								accessToken: "refreshed-access-token",
								refreshToken: "refreshed-refresh-token",
								expiresAt: "2026-03-03T01:00:00.000Z",
								mcpUrl: "http://localhost:3000/mcp",
								statusUrl: "http://localhost:3001/api/connect/runtime-status",
								refreshUrl:
									"http://localhost:3001/api/connect/bridge-session/refresh",
								plan: "solo",
								accountLabel: "Armando",
								serverName: "bardo",
							}),
							{
								status: 200,
								headers: { "content-type": "application/json" },
							},
						);
					}

					expect(String(input)).toBe(
						"http://127.0.0.1:3001/api/connect/runtime-status",
					);
					expect(new Headers(init?.headers).get("authorization")).toBe(
						"Bearer refreshed-access-token",
					);
					return new Response(
						JSON.stringify({
							valid: true,
							plan: "solo",
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
				apiKey: "refreshed-access-token",
				url: "http://127.0.0.1:3000/mcp",
				workspaceRoot,
				plan: "solo",
			});
			const saved = JSON.parse(
				await readFile(path.join(homeDir, ".config/bardo/config.json"), "utf8"),
			) as {
				accessToken: string;
				refreshToken: string;
				url: string;
			};
			expect(saved.accessToken).toBe("refreshed-access-token");
			expect(saved.refreshToken).toBe("refreshed-refresh-token");
			expect(saved.url).toBe("http://127.0.0.1:3000/mcp");
			expect(stderr.read()).toBe("");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("mcp serve prefers refreshed bridge config over stale shell credentials", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stderr = createWriter();

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						version: 2,
						accessToken: "expired-config-access-token",
						refreshToken: "refresh-token",
						expiresAtISO: "2026-03-03T00:00:00.000Z",
						url: "http://127.0.0.1:3000/mcp",
						statusUrl: "http://127.0.0.1:3001/api/connect/runtime-status",
						refreshUrl:
							"http://127.0.0.1:3001/api/connect/bridge-session/refresh",
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
				env: {
					BARDO_ACCESS_TOKEN: "stale-shell-token",
					BARDO_MCP_URL: "http://127.0.0.1:3999/mcp",
					BARDO_RUNTIME_STATUS_URL:
						"http://127.0.0.1:3999/api/connect/runtime-status",
				},
				stderr,
				stdout: createWriter(),
				now: () => new Date("2026-03-03T00:20:00.000Z"),
				startBridge: async (options) => {
					received = options as typeof received;
				},
				fetch: async (input, init) => {
					if (
						String(input) ===
						"http://127.0.0.1:3001/api/connect/bridge-session/refresh"
					) {
						expect(await new Response(init?.body).text()).toContain(
							"refresh-token",
						);
						return new Response(
							JSON.stringify({
								accessToken: "refreshed-config-token",
								refreshToken: "refreshed-refresh-token",
								expiresAt: "2026-03-03T01:00:00.000Z",
								mcpUrl: "http://127.0.0.1:3000/mcp",
								statusUrl: "http://127.0.0.1:3001/api/connect/runtime-status",
								refreshUrl:
									"http://127.0.0.1:3001/api/connect/bridge-session/refresh",
								plan: "solo",
								accountLabel: "Armando",
								serverName: "bardo",
							}),
							{
								status: 200,
								headers: { "content-type": "application/json" },
							},
						);
					}

					expect(String(input)).toBe(
						"http://127.0.0.1:3001/api/connect/runtime-status",
					);
					expect(new Headers(init?.headers).get("authorization")).toBe(
						"Bearer refreshed-config-token",
					);
					return new Response(
						JSON.stringify({
							valid: true,
							plan: "solo",
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
				apiKey: "refreshed-config-token",
				url: "http://127.0.0.1:3000/mcp",
				workspaceRoot,
				plan: "solo",
			});
			expect(stderr.read()).toBe("");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("mcp serve fails fast when bridge refresh times out for an expired session", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stderr = createWriter();

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						version: 2,
						accessToken: "expired-access-token",
						refreshToken: "refresh-token",
						expiresAtISO: "2026-03-03T00:00:00.000Z",
						url: "http://127.0.0.1:3000/mcp",
						refreshUrl:
							"http://127.0.0.1:3001/api/connect/bridge-session/refresh",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);

			const exitCode = await runCli(["mcp", "serve"], {
				cwd: workspaceRoot,
				homeDir,
				stderr,
				stdout: createWriter(),
				env: {
					BARDO_BRIDGE_REFRESH_TIMEOUT_MS: "100",
				},
				now: () => new Date("2026-03-03T00:20:00.000Z"),
				startBridge: async () => {
					throw new Error("startBridge should not run after refresh timeout");
				},
				fetch: async (_input, init) =>
					await new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () => {
							reject(new DOMException("Aborted", "AbortError"));
						});
					}),
			});

			expect(exitCode).toBe(1);
			expect(stderr.read()).toContain("Bridge session refresh failed:");
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
						url: "http://127.0.0.1:3000/mcp",
						statusUrl: "https://www.bardo.gg/api/connect/runtime-status",
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

	test("mcp serve times out stale runtime status lookups before starting the local broker", async () => {
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
						url: "http://127.0.0.1:3000/mcp",
						statusUrl: "https://www.bardo.gg/api/connect/runtime-status",
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
				env: {
					BARDO_RUNTIME_STATUS_TIMEOUT_MS: "100",
				},
				stderr,
				stdout: createWriter(),
				startBridge: async (options) => {
					receivedPlan =
						(options as { plan?: string | null }).plan === undefined
							? "undefined"
							: String((options as { plan?: string | null }).plan);
				},
				fetch: async (_input, init) =>
					await new Promise<Response>((_resolve, reject) => {
						const abort = init?.signal;
						const onAbort = () =>
							reject(
								Object.assign(new Error("aborted"), { name: "AbortError" }),
							);
						abort?.addEventListener("abort", onAbort, { once: true });
					}),
			});

			expect(exitCode).toBe(0);
			expect(receivedPlan).toBe("null");
			expect(stderr.read()).toContain("timed out");
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
						url: "http://127.0.0.1:3000/mcp",
						statusUrl: "https://www.bardo.gg/api/connect/runtime-status",
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
						url: "http://127.0.0.1:3000/mcp",
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
			expect(config.mcpServers.bardo.command).toBe("bardo");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("install writes a Kiro workspace config using saved credentials", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "bardo_live_saved",
						url: "http://127.0.0.1:3000/mcp",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);

			const exitCode = await runCli(["install", "--client", "kiro"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: createWriter(),
				stderr: createWriter(),
			});

			expect(exitCode).toBe(0);
			await expect(
				readFile(path.join(workspaceRoot, ".kiro/settings/mcp.json"), "utf8"),
			).resolves.toContain('"mcpServers"');
			await expect(
				readFile(path.join(workspaceRoot, ".kiro/settings/mcp.json"), "utf8"),
			).resolves.toContain('"bardo"');
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("install writes a Gemini workspace config using saved credentials", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "bardo_live_saved",
						url: "http://127.0.0.1:3000/mcp",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);

			const exitCode = await runCli(["install", "--client", "gemini"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: createWriter(),
				stderr: createWriter(),
			});

			expect(exitCode).toBe(0);
			await expect(
				readFile(path.join(workspaceRoot, ".gemini/settings.json"), "utf8"),
			).resolves.toContain('"mcpServers"');
			await expect(
				readFile(path.join(workspaceRoot, ".gemini/settings.json"), "utf8"),
			).resolves.toContain('"bardo"');
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("install writes a Trae workspace config using saved credentials", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "bardo_live_saved",
						url: "http://127.0.0.1:3000/mcp",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);

			const exitCode = await runCli(["install", "--client", "trae"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: createWriter(),
				stderr: createWriter(),
			});

			expect(exitCode).toBe(0);
			await expect(
				readFile(path.join(workspaceRoot, ".trae/mcp.json"), "utf8"),
			).resolves.toContain('"mcpServers"');
			await expect(
				readFile(path.join(workspaceRoot, ".trae/mcp.json"), "utf8"),
			).resolves.toContain('"bardo"');
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("install can auto-detect the client from an existing workspace config", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "bardo_live_saved",
						url: "http://127.0.0.1:3000/mcp",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);
			await mkdir(path.join(workspaceRoot, ".kiro/settings"), {
				recursive: true,
			});
			await writeFile(
				path.join(workspaceRoot, ".kiro/settings/mcp.json"),
				JSON.stringify({ mcpServers: {} }, null, 2),
				"utf8",
			);

			const stdout = createWriter();
			const exitCode = await runCli(["install", "--client", "auto"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr: createWriter(),
			});

			expect(exitCode).toBe(0);
			expect(stdout.read()).toContain(".kiro/settings/mcp.json");
			await expect(
				readFile(path.join(workspaceRoot, ".kiro/settings/mcp.json"), "utf8"),
			).resolves.toContain('"bardo"');
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("install can write a local client config before login when a local MCP URL is provided", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();

		try {
			const exitCode = await runCli(["install", "--client", "codex"], {
				cwd: workspaceRoot,
				homeDir,
				stdout,
				stderr,
				env: {
					BARDO_MCP_URL: "http://127.0.0.1:3000/mcp",
				},
			});

			expect(exitCode).toBe(0);
			expect(stderr.read()).toBe("");
			expect(stdout.read()).toContain(".codex/config.toml");
			await expect(
				readFile(path.join(workspaceRoot, ".codex/config.toml"), "utf8"),
			).resolves.toContain('command = "bardo"');
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("install auto-detect fails when multiple supported client configs already exist", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stderr = createWriter();

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "bardo_live_saved",
						url: "http://127.0.0.1:3000/mcp",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);
			await mkdir(path.join(workspaceRoot, ".kiro/settings"), {
				recursive: true,
			});
			await mkdir(path.join(workspaceRoot, ".cursor"), { recursive: true });
			await writeFile(
				path.join(workspaceRoot, ".kiro/settings/mcp.json"),
				JSON.stringify({ mcpServers: {} }, null, 2),
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, ".cursor/mcp.json"),
				JSON.stringify({ mcpServers: {} }, null, 2),
				"utf8",
			);

			const exitCode = await runCli(["install", "--client", "auto"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: createWriter(),
				stderr,
			});

			expect(exitCode).toBe(1);
			expect(stderr.read()).toContain("Multiple client configs detected");
			expect(stderr.read()).toContain("kiro");
			expect(stderr.read()).toContain("cursor");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("connect logs in, bootstraps the workspace, and installs a Kilo config", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();

		try {
			await writeFile(
				path.join(workspaceRoot, "rulebook.md"),
				"# Workspace Rulebook\n\nConverted markdown source.",
				"utf8",
			);
			const exitCode = await runCli(
				[
					"connect",
					"--client",
					"kilo",
					"--api-key",
					"bardo_live_connect",
					"--url",
					"http://127.0.0.1:3000/mcp",
					"--ruleset",
					"shadowdark",
				],
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
			expect(stdout.read()).toContain("Initialized Bardo workspace");
			expect(stdout.read()).toContain("Connected Bardo to Kilo Code");

			await expect(
				readFile(path.join(workspaceRoot, ".bardo/manifest.json"), "utf8"),
			).resolves.toContain('"ruleset": "shadowdark"');
			await expect(
				readFile(path.join(workspaceRoot, ".kilocode/mcp.json"), "utf8"),
			).resolves.toContain('"mcpServers"');
			await expect(
				readFile(path.join(workspaceRoot, ".kilocode/mcp.json"), "utf8"),
			).resolves.toContain('"bardo"');
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("connect logs in, bootstraps the workspace, and installs a Gemini config", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();

		try {
			await writeFile(
				path.join(workspaceRoot, "rulebook.md"),
				"# Workspace Rulebook\n\nConverted markdown source.",
				"utf8",
			);
			const exitCode = await runCli(
				[
					"connect",
					"--client",
					"gemini",
					"--api-key",
					"bardo_live_connect",
					"--url",
					"http://127.0.0.1:3000/mcp",
					"--ruleset",
					"shadowdark",
				],
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
			expect(stdout.read()).toContain("Initialized Bardo workspace");
			expect(stdout.read()).toContain("Connected Bardo to Gemini CLI");

			await expect(
				readFile(path.join(workspaceRoot, ".bardo/manifest.json"), "utf8"),
			).resolves.toContain('"ruleset": "shadowdark"');
			await expect(
				readFile(path.join(workspaceRoot, ".gemini/settings.json"), "utf8"),
			).resolves.toContain('"mcpServers"');
			await expect(
				readFile(path.join(workspaceRoot, ".gemini/settings.json"), "utf8"),
			).resolves.toContain('"bardo"');
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("connect can auto-detect the client from an existing workspace config", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();

		try {
			await writeFile(
				path.join(workspaceRoot, "rulebook.md"),
				"# Workspace Rulebook\n\nConverted markdown source.",
				"utf8",
			);
			await mkdir(path.join(workspaceRoot, ".kiro/settings"), {
				recursive: true,
			});
			await writeFile(
				path.join(workspaceRoot, ".kiro/settings/mcp.json"),
				JSON.stringify({ mcpServers: {} }, null, 2),
				"utf8",
			);

			const exitCode = await runCli(
				[
					"connect",
					"--client",
					"auto",
					"--api-key",
					"bardo_live_connect",
					"--url",
					"http://127.0.0.1:3000/mcp",
					"--ruleset",
					"shadowdark",
				],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout,
					stderr,
				},
			);

			expect(exitCode).toBe(0);
			expect(stderr.read()).toBe("");
			expect(stdout.read()).toContain("Connected Bardo to Kiro");
			await expect(
				readFile(path.join(workspaceRoot, ".bardo/manifest.json"), "utf8"),
			).resolves.toContain('"ruleset": "shadowdark"');
			await expect(
				readFile(path.join(workspaceRoot, ".kiro/settings/mcp.json"), "utf8"),
			).resolves.toContain('"bardo"');
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("connect updates status URL without forcing interactive re-login", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();
		const configPath = path.join(homeDir, ".config/bardo/config.json");

		try {
			await writeFile(
				path.join(workspaceRoot, "rulebook.md"),
				"# Workspace Rulebook\n\nConverted markdown source.",
				"utf8",
			);
			await mkdir(path.dirname(configPath), { recursive: true });
			await writeFile(
				configPath,
				JSON.stringify(
					{
						apiKey: "bardo_live_saved",
						url: "http://127.0.0.1:3000/mcp",
						statusUrl: "https://www.bardo.gg/api/connect/runtime-status",
						updatedAtISO: "2026-03-03T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);

			const exitCode = await runCli(
				[
					"connect",
					"--client",
					"kiro",
					"--status-url",
					"https://staging.bardo.ai/api/connect/runtime-status",
				],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout,
					stderr,
					fetch: async (input) => {
						throw new Error(
							`Unexpected network call while reusing saved credentials: ${String(input)}`,
						);
					},
				},
			);

			expect(exitCode).toBe(0);
			expect(stderr.read()).toBe("");
			const saved = JSON.parse(await readFile(configPath, "utf8")) as {
				apiKey: string;
				url: string;
				statusUrl?: string;
			};
			expect(saved.apiKey).toBe("bardo_live_saved");
			expect(saved.url).toBe("http://127.0.0.1:3000/mcp");
			expect(saved.statusUrl).toBe(
				"https://staging.bardo.ai/api/connect/runtime-status",
			);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("connect persists URL metadata when credentials only come from the environment", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();
		const configPath = path.join(homeDir, ".config/bardo/config.json");

		try {
			const exitCode = await runCli(
				[
					"connect",
					"--client",
					"kiro",
					"--url",
					"https://mcp-env.bardo.ai/mcp",
					"--status-url",
					"https://www.bardo.gg/api/connect/runtime-status",
					"--server-name",
					"campaign-gm",
					"--skip-init",
				],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout,
					stderr,
					env: {
						BARDO_API_KEY: "bardo_live_env_only",
					},
				},
			);

			expect(exitCode).toBe(0);
			expect(stderr.read()).toBe("");
			expect(stdout.read()).toContain("Connected Bardo to Kiro");

			const saved = JSON.parse(await readFile(configPath, "utf8")) as {
				apiKey: string;
				url: string;
				statusUrl?: string;
				serverName?: string;
			};
			expect(saved).toMatchObject({
				apiKey: "bardo_live_env_only",
				url: "https://mcp-env.bardo.ai/mcp",
				statusUrl: "https://www.bardo.gg/api/connect/runtime-status",
				serverName: "campaign-gm",
			});

			const clientConfig = JSON.parse(
				await readFile(
					path.join(workspaceRoot, ".kiro/settings/mcp.json"),
					"utf8",
				),
			) as {
				mcpServers: Record<
					string,
					{
						command?: string;
						args?: string[];
						url?: string;
						headers?: Record<string, string>;
					}
				>;
			};
			expect(clientConfig.mcpServers["campaign-gm"]).toEqual({
				command: "bardo",
				args: [
					"mcp",
					"serve",
					"--url",
					"https://mcp-env.bardo.ai/mcp",
					"--workspace-root",
					".",
				],
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("connect preserves a bridge-session config when only metadata overrides change", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();
		const configPath = path.join(homeDir, ".config/bardo/config.json");

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				configPath,
				JSON.stringify(
					{
						version: 2,
						accessToken: "bridge-access-token",
						refreshToken: "bridge-refresh-token",
						expiresAtISO: "2026-03-21T00:00:00.000Z",
						url: "http://127.0.0.1:3000/mcp",
						statusUrl: "http://127.0.0.1:3001/api/connect/runtime-status",
						refreshUrl:
							"http://127.0.0.1:3001/api/connect/bridge-session/refresh",
						serverName: "bardo",
						accountLabel: "Armando",
						plan: "solo",
						updatedAtISO: "2026-03-20T00:00:00.000Z",
					},
					null,
					2,
				),
				"utf8",
			);

			const exitCode = await runCli(
				[
					"connect",
					"--client",
					"kiro",
					"--url",
					"http://127.0.0.1:3000/mcp",
					"--status-url",
					"http://127.0.0.1:3001/api/connect/runtime-status",
					"--server-name",
					"campaign-gm",
					"--skip-init",
				],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout,
					stderr,
				},
			);

			expect(exitCode).toBe(0);
			expect(stderr.read()).toBe("");
			expect(stdout.read()).toContain("Connected Bardo to Kiro");

			const saved = JSON.parse(await readFile(configPath, "utf8")) as {
				version: number;
				accessToken: string;
				refreshToken: string;
				expiresAtISO: string;
				url: string;
				statusUrl?: string;
				refreshUrl?: string;
				serverName?: string;
				accountLabel?: string;
				plan?: string;
			};
			expect(saved).toMatchObject({
				version: 2,
				accessToken: "bridge-access-token",
				refreshToken: "bridge-refresh-token",
				expiresAtISO: "2026-03-21T00:00:00.000Z",
				url: "http://127.0.0.1:3000/mcp",
				statusUrl: "http://127.0.0.1:3001/api/connect/runtime-status",
				refreshUrl: "http://127.0.0.1:3001/api/connect/bridge-session/refresh",
				serverName: "campaign-gm",
				accountLabel: "Armando",
				plan: "solo",
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("connect dry-run previews install output without persisting login or bootstrapping", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();

		try {
			const exitCode = await runCli(
				[
					"connect",
					"--client",
					"codex",
					"--mode",
					"local",
					"--dry-run",
					"--api-key",
					"bardo_live_preview",
					"--url",
					"http://127.0.0.1:3000/mcp",
				],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout,
					stderr,
				},
			);

			expect(exitCode).toBe(0);
			expect(stderr.read()).toBe("");
			expect(stdout.read()).toContain("[mcp_servers.bardo]");
			expect(stdout.read()).not.toContain("Connected Bardo");
			await expect(
				readFile(path.join(homeDir, ".config/bardo/config.json"), "utf8"),
			).rejects.toMatchObject({
				code: "ENOENT",
			});
			await expect(
				readFile(path.join(workspaceRoot, ".bardo/manifest.json"), "utf8"),
			).rejects.toMatchObject({
				code: "ENOENT",
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("init rejects rulebook imports outside the active workspace", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const externalRoot = await createTempDir("bardo-external-");
		const stdout = createWriter();
		const stderr = createWriter();
		const externalRulebook = path.join(externalRoot, "shadowdark.md");

		try {
			await writeFile(externalRulebook, "# Shadowdark", "utf8");

			const exitCode = await runCli(
				["init", "--rulebook", externalRulebook, "--ruleset", "shadowdark"],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout,
					stderr,
				},
			);

			expect(exitCode).toBe(1);
			expect(stderr.read()).toContain("workspace");
			await expect(
				readFile(path.join(workspaceRoot, ".bardo/rules/rulebook.md"), "utf8"),
			).rejects.toMatchObject({
				code: "ENOENT",
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
			await rm(externalRoot, { recursive: true, force: true });
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
						url: "http://127.0.0.1:3000/mcp",
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
			expect(config.mcpServers.bardo.command).toBe("bardo");
			expect(config.mcpServers.bardo.args).toContain("--workspace-root");
			expect(config.mcpServers.bardo.args).not.toContain("--api-key");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("install rejects unsupported OpenCode remote mode", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "bardo_live_saved",
						url: "http://127.0.0.1:3000/mcp",
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

			expect(exitCode).toBe(1);
			await expect(
				readFile(path.join(workspaceRoot, "opencode.json"), "utf8"),
			).resolves.toContain('"existing"');
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("install writes a merge-safe OpenCode workspace config", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");

		try {
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "bardo_live_saved",
						url: "http://127.0.0.1:3000/mcp",
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

			const exitCode = await runCli(["install", "--client", "opencode"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: createWriter(),
				stderr: createWriter(),
			});

			expect(exitCode).toBe(0);
			const config = JSON.parse(
				await readFile(path.join(workspaceRoot, "opencode.json"), "utf8"),
			) as {
				instructions?: string[];
				mcp: Record<
					string,
					{ type: string; command: string[]; enabled: boolean }
				>;
			};
			expect(config.mcp.existing.command).toEqual(["uvx", "existing-tool"]);
			expect(config.mcp.bardo.type).toBe("local");
			expect(config.mcp.bardo.enabled).toBe(true);
			expect(config.mcp.bardo.command).toContain("bardo");
			expect(config.mcp.bardo.command).toContain("--workspace-root");
			expect(config.instructions).toEqual(
				expect.arrayContaining([
					".bardo/docs/agent-contract.md",
					".bardo/docs/clients/opencode.md",
				]),
			);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("connect logs in, bootstraps the workspace, and installs an OpenCode config", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();

		try {
			await writeFile(
				path.join(workspaceRoot, "rulebook.md"),
				"# Workspace Rulebook\n\nConverted markdown source.",
				"utf8",
			);
			const exitCode = await runCli(
				[
					"connect",
					"--client",
					"opencode",
					"--api-key",
					"bardo_live_connect",
					"--url",
					"http://127.0.0.1:3000/mcp",
					"--ruleset",
					"shadowdark",
				],
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
			expect(stdout.read()).toContain("Initialized Bardo workspace");
			expect(stdout.read()).toContain("Connected Bardo to OpenCode");

			await expect(
				readFile(path.join(workspaceRoot, ".bardo/manifest.json"), "utf8"),
			).resolves.toContain('"ruleset": "shadowdark"');
			await expect(
				readFile(path.join(workspaceRoot, "opencode.json"), "utf8"),
			).resolves.toContain('"mcp"');
			await expect(
				readFile(path.join(workspaceRoot, "opencode.json"), "utf8"),
			).resolves.toContain('"bardo"');
			await expect(
				readFile(path.join(workspaceRoot, "opencode.json"), "utf8"),
			).resolves.toContain('"instructions"');
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("export copies the .bardo workspace into the target directory", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const exportRoot = await createTempDir("bardo-export-");

		try {
			await writeFile(
				path.join(workspaceRoot, "rulebook.md"),
				"# Workspace Rulebook\n\nConverted markdown source.",
				"utf8",
			);
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
				readFile(path.join(exportRoot, ".bardo/manifest.json"), "utf8"),
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
			await writeFile(
				path.join(workspaceRoot, "rulebook.md"),
				"# Workspace Rulebook\n\nConverted markdown source.",
				"utf8",
			);
			await mkdir(path.join(homeDir, ".config/bardo"), { recursive: true });
			await writeFile(
				path.join(homeDir, ".config/bardo/config.json"),
				JSON.stringify(
					{
						apiKey: "bardo_live_saved_secret",
						url: "http://127.0.0.1:3000/mcp",
						statusUrl: "https://www.bardo.gg/api/connect/runtime-status",
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
					if (url === "http://127.0.0.1:3000/health") {
						return new Response(JSON.stringify({ ok: true }), {
							status: 200,
							headers: { "content-type": "application/json" },
						});
					}
					if (url === "https://www.bardo.gg/api/connect/runtime-status") {
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
