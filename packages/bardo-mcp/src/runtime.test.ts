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
			};

			expect(saved.apiKey).toBe("bardo_live_exchange");
			expect(saved.url).toBe("https://mcp.bardo.ai/mcp");
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
});
