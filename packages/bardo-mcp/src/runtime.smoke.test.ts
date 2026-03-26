import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
			const loginExitCode = await runCli(["login"], {
				cwd: workspaceRoot,
				homeDir,
				stdout: loginStdout,
				stderr: loginStderr,
				env: {
					BARDO_LOGIN_START_URL:
						"https://app.bardo.ai/api/connect/bridge-session/start",
				},
				sleep: async () => {},
				fetch: async (input) => {
					const url = String(input);
					if (url === "https://app.bardo.ai/api/connect/bridge-session/start") {
						return new Response(
							JSON.stringify({
								sessionId: "bridge_session_123",
								userCode: "ABCD-1234",
								verificationUrl:
									"https://app.bardo.ai/dashboard/connect/bridge/bridge_session_123",
								pollUrl:
									"https://app.bardo.ai/api/connect/bridge-session/poll?sessionId=bridge_session_123&pollSecret=poll_secret_123",
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
						"https://app.bardo.ai/api/connect/bridge-session/poll?sessionId=bridge_session_123&pollSecret=poll_secret_123"
					) {
						return new Response(
							JSON.stringify({
								status: "approved",
								accessToken: "bardo_bridge_access_smoke",
								refreshToken: "bardo_bridge_refresh_smoke",
								expiresAt: "2099-03-03T00:10:00.000Z",
								mcpBaseUrl: "https://mcp.bardo.ai",
								statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
								refreshUrl:
									"https://app.bardo.ai/api/connect/bridge-session/refresh",
								accountLabel: "Smoke User",
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
					if (url === "https://mcp.bardo.ai/health") {
						return new Response(JSON.stringify({ ok: true }), {
							status: 200,
							headers: { "content-type": "application/json" },
						});
					}
					if (url === "https://app.bardo.ai/api/connect/runtime-status") {
						const auth = new Headers(init?.headers).get("authorization");
						expect(auth).toBe("Bearer bardo_bridge_access_smoke");
						return new Response(
							JSON.stringify({
								valid: true,
								subjectId: "user_smoke",
								keyId: "key_smoke",
								scopes: ["mcp"],
								workspacePath: "./customers/user_smoke",
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
			expect(doctorPayload.account.plan).toBe("solo");

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
				readFile(path.join(workspaceRoot, "bardo/manifest.json"), "utf8"),
			).resolves.toContain('"ruleset": "shadowdark"');
			await expect(
				readFile(path.join(workspaceRoot, ".codex/config.toml"), "utf8"),
			).resolves.toContain("[mcp_servers.bardo]");
			await expect(
				readFile(path.join(workspaceRoot, "bardo/docs/quickstart.md"), "utf8"),
			).resolves.toContain("approve the bridge in your browser");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});
});
