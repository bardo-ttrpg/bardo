import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli } from "./runtime";

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

describe("bardo runtime smoke gate", () => {
	test("bridge-authenticated connect, doctor, clients list, and bootstrap succeed from a clean workspace", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const loginStdout = createWriter();
		const loginStderr = createWriter();
		const connectStdout = createWriter();
		const connectStderr = createWriter();
		const doctorStdout = createWriter();
		const doctorStderr = createWriter();
		const clientsStdout = createWriter();
		const clientsStderr = createWriter();

		try {
			await writeFile(
				path.join(workspaceRoot, "rulebook.md"),
				"# Workspace Rulebook\n\nTravel procedures and consequence tracking matter.",
				"utf8",
			);
			const loginExitCode = await runCli(["login"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: loginStdout,
				stderr: loginStderr,
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
								sessionId: "bridge_session_123",
								userCode: "ABCD-1234",
								verificationUrl:
									"https://www.bardo.gg/dashboard/connect/bridge/bridge_session_123",
								pollUrl:
									"https://www.bardo.gg/api/connect/bridge-session/poll?sessionId=bridge_session_123&pollSecret=poll_secret_123",
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
						"https://www.bardo.gg/api/connect/bridge-session/poll?sessionId=bridge_session_123&pollSecret=poll_secret_123"
					) {
						return new Response(
							JSON.stringify({
								status: "approved",
								accessToken: "bardo_bridge_access_smoke",
								refreshToken: "bardo_bridge_refresh_smoke",
								expiresAt: "2099-03-03T00:10:00.000Z",
								mcpUrl: "http://127.0.0.1:3000/mcp",
								statusUrl: "https://www.bardo.gg/api/connect/runtime-status",
								refreshUrl:
									"https://www.bardo.gg/api/connect/bridge-session/refresh",
								accountLabel: "Smoke User",
								plan: "pro",
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

			expect(loginExitCode).toBe(0);
			expect(loginStderr.read()).toBe("");
			expect(loginStdout.read()).toContain("/dashboard/connect/bridge/");

			const connectExitCode = await runCli(
				["connect", "--client", "codex", "--ruleset", "shadowdark"],
				{
					cwd: workspaceRoot,
					homeDir,
					stdout: connectStdout,
					stderr: connectStderr,
				},
			);

			expect(connectExitCode).toBe(0);
			expect(connectStderr.read()).toBe("");
			expect(connectStdout.read()).toContain("Connected Bardo to Codex");

			const doctorExitCode = await runCli(["doctor", "--json"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: doctorStdout,
				stderr: doctorStderr,
				fetch: async (input, init) => {
					const url = String(input);
					if (url === "http://127.0.0.1:3000/health") {
						return new Response(JSON.stringify({ ok: true }), {
							status: 200,
							headers: { "content-type": "application/json" },
						});
					}
					if (url === "https://www.bardo.gg/api/connect/runtime-status") {
						const auth = new Headers(init?.headers).get("authorization");
						expect(auth).toBe("Bearer bardo_bridge_access_smoke");
						return new Response(
							JSON.stringify({
								valid: true,
								subjectId: "user_smoke",
								keyId: "key_smoke",
								scopes: ["mcp"],
								workspacePath: "./customers/user_smoke",
								plan: "pro",
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

			expect(doctorExitCode).toBe(0);
			expect(doctorStderr.read()).toBe("");
			const doctorPayload = JSON.parse(doctorStdout.read()) as {
				auth: { configured: boolean };
				workspace: { initialized: boolean; bardoRoot: string };
				connectivity: { health: { ok: boolean } };
				account: { ok: boolean; plan: string | null };
			};
			expect(doctorPayload.auth.configured).toBe(true);
			expect(doctorPayload.workspace.initialized).toBe(true);
			expect(doctorPayload.connectivity.health.ok).toBe(true);
			expect(doctorPayload.account.ok).toBe(true);
			expect(doctorPayload.account.plan).toBe("pro");

			const clientsExitCode = await runCli(["clients", "list", "--json"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: clientsStdout,
				stderr: clientsStderr,
			});
			expect(clientsExitCode).toBe(0);
			expect(clientsStderr.read()).toBe("");
			const clientsPayload = JSON.parse(clientsStdout.read()) as Array<{
				id: string;
			}>;
			expect(clientsPayload.some((client) => client.id === "codex")).toBe(true);

			await expect(
				readFile(path.join(workspaceRoot, ".bardo/manifest.json"), "utf8"),
			).resolves.toContain('"ruleset": "shadowdark"');
			await expect(
				readFile(path.join(workspaceRoot, ".codex/config.toml"), "utf8"),
			).resolves.toContain("[mcp_servers.bardo]");
			await expect(
				readFile(path.join(workspaceRoot, ".bardo/docs/quickstart.md"), "utf8"),
			).resolves.toContain("approve the bridge in your browser");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("OpenCode connect produces a valid local workspace config", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();

		try {
			await writeFile(
				path.join(workspaceRoot, "rulebook.md"),
				"# Workspace Rulebook\n\nTravel procedures and consequence tracking matter.",
				"utf8",
			);

			const exitCode = await runCli(
				[
					"connect",
					"--client",
					"opencode",
					"--api-key",
					"bardo_bridge_access_smoke",
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
			expect(stdout.read()).toContain("Connected Bardo to OpenCode");

			const config = JSON.parse(
				await readFile(path.join(workspaceRoot, "opencode.json"), "utf8"),
			) as {
				instructions?: string[];
				mcp: Record<
					string,
					{ type: string; command: string[]; enabled: boolean }
				>;
			};
			expect(config.mcp.bardo).toEqual({
				type: "local",
				command: [
					"bardo",
					"mcp",
					"serve",
					"--url",
					"http://127.0.0.1:3000/mcp",
					"--workspace-root",
					".",
				],
				enabled: true,
			});
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

	test("Gemini connect produces a valid local workspace config", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const stdout = createWriter();
		const stderr = createWriter();

		try {
			await writeFile(
				path.join(workspaceRoot, "rulebook.md"),
				"# Workspace Rulebook\n\nTravel procedures and consequence tracking matter.",
				"utf8",
			);

			const exitCode = await runCli(
				[
					"connect",
					"--client",
					"gemini",
					"--api-key",
					"bardo_bridge_access_smoke",
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
			expect(stdout.read()).toContain("Connected Bardo to Gemini CLI");

			const config = JSON.parse(
				await readFile(
					path.join(workspaceRoot, ".gemini/settings.json"),
					"utf8",
				),
			) as {
				mcpServers: Record<string, { command: string; args: string[] }>;
			};
			expect(config.mcpServers.bardo).toEqual({
				command: "bardo",
				args: [
					"mcp",
					"serve",
					"--url",
					"http://127.0.0.1:3000/mcp",
					"--workspace-root",
					".",
				],
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});
});
