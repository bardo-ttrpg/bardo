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
	test("connect, doctor, clients list, and bootstrap succeed from a clean workspace", async () => {
		const homeDir = await createTempDir("bardo-home-");
		const workspaceRoot = await createTempDir("bardo-workspace-");
		const connectStdout = createWriter();
		const connectStderr = createWriter();
		const doctorStdout = createWriter();
		const doctorStderr = createWriter();
		const clientsStdout = createWriter();
		const clientsStderr = createWriter();

		try {
			const connectExitCode = await runCli(
				[
					"connect",
					"--client",
					"codex",
					"--api-key",
					"bardo_live_smoke",
					"--url",
					"https://mcp.bardo.ai/mcp",
					"--status-url",
					"https://app.bardo.ai/api/connect/runtime-status",
					"--ruleset",
					"shadowdark",
				],
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
						expect(auth).toBe("Bearer bardo_live_smoke");
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
		} finally {
			await rm(homeDir, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});
});
