import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { renderUnixInstallScript } from "../website/lib/install-script";

type ScenarioResult = {
	name: string;
	ok: boolean;
	details: string;
	durationMs: number;
};

type CommandResult = {
	status: number;
	stdout: string;
	stderr: string;
};

const SANDBOX_ROOT =
	process.env.BARDO_STRESS_ROOT?.trim() ||
	"/home/armando/projects/test-bardo-01";
const REPO_ROOT = "/home/armando/projects/bardo";
const FIXTURE_ROOT = path.join(REPO_ROOT, "scripts", "stress-fixtures");
const PACKAGE_JSON_PATH = path.join(
	REPO_ROOT,
	"packages",
	"bardo-mcp",
	"package.json",
);

async function resolveVersion(): Promise<string> {
	const raw = await readFile(PACKAGE_JSON_PATH, "utf8");
	const parsed = JSON.parse(raw) as { version?: string };
	if (!parsed.version?.trim()) {
		throw new Error("packages/bardo-mcp/package.json is missing a version.");
	}
	return parsed.version.startsWith("v")
		? parsed.version.trim()
		: `v${parsed.version.trim()}`;
}

async function awaitAvailablePort(): Promise<number> {
	return await new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close(() => reject(new Error("Could not reserve a port.")));
				return;
			}
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(address.port);
			});
		});
	});
}

async function runCommand(args: {
	command: string;
	commandArgs: string[];
	cwd: string;
	env?: NodeJS.ProcessEnv;
	expectedStatus?: number;
}): Promise<CommandResult> {
	const process = Bun.spawn([args.command, ...args.commandArgs], {
		cwd: args.cwd,
		env: args.env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [status, stdout, stderr] = await Promise.all([
		process.exited,
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
	]);
	const expectedStatus = args.expectedStatus ?? 0;
	if (status !== expectedStatus) {
		throw new Error(
			`${args.command} ${args.commandArgs.join(" ")} exited with ${status}.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
		);
	}
	return { status, stdout, stderr };
}

async function runCommandAllowFailure(args: {
	command: string;
	commandArgs: string[];
	cwd: string;
	env?: NodeJS.ProcessEnv;
}): Promise<CommandResult> {
	const process = Bun.spawn([args.command, ...args.commandArgs], {
		cwd: args.cwd,
		env: args.env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [status, stdout, stderr] = await Promise.all([
		process.exited,
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
	]);
	return { status, stdout, stderr };
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

function readCommittedFlag(structuredContent: unknown): boolean | null {
	if (
		typeof structuredContent === "object" &&
		structuredContent !== null &&
		"committed" in structuredContent &&
		typeof structuredContent.committed === "boolean"
	) {
		return structuredContent.committed;
	}
	return null;
}

async function pathExists(targetPath: string): Promise<boolean> {
	return await stat(targetPath)
		.then(() => true)
		.catch((error: unknown) => {
			if (
				typeof error === "object" &&
				error !== null &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return false;
			}
			throw error;
		});
}

async function copyFixture(name: string, destination: string): Promise<void> {
	await cp(path.join(FIXTURE_ROOT, name), destination, { recursive: true });
}

async function startSupportServer(version: string) {
	const port = await awaitAvailablePort();
	const baseUrl = `http://127.0.0.1:${port}`;
	const releaseRoot = path.join(
		REPO_ROOT,
		"packages",
		"bardo-mcp",
		"dist",
		"release",
	);
	const accessToken = "bardo_bridge_access_stress";
	const refreshToken = "bardo_bridge_refresh_stress";

	const server = Bun.serve({
		port,
		hostname: "127.0.0.1",
		async fetch(request) {
			const url = new URL(request.url);
			if (url.pathname.startsWith(`/releases/${version}/`)) {
				const relativePath = url.pathname.replace(`/releases/${version}/`, "");
				const filePath = path.join(releaseRoot, relativePath);
				const file = Bun.file(filePath);
				if (!(await file.exists())) {
					return new Response("Not found", { status: 404 });
				}
				return new Response(file, {
					status: 200,
					headers: {
						"content-type":
							relativePath === "SHA256SUMS.txt"
								? "text/plain; charset=utf-8"
								: "application/octet-stream",
					},
				});
			}

			if (url.pathname === "/api/connect/bridge-session/start") {
				return Response.json({
					sessionId: "stress_session_001",
					userCode: "STRS-0001",
					verificationUrl: `${baseUrl}/dashboard/connect/bridge/stress_session_001`,
					pollUrl: `${baseUrl}/api/connect/bridge-session/poll?sessionId=stress_session_001&pollSecret=stress_poll_secret`,
					intervalMs: 1,
				});
			}

			if (url.pathname === "/api/connect/bridge-session/poll") {
				return Response.json({
					status: "approved",
					accessToken,
					refreshToken,
					expiresAt: "2099-04-09T12:00:00.000Z",
					mcpUrl: `${baseUrl}/mcp`,
					statusUrl: `${baseUrl}/api/connect/runtime-status`,
					refreshUrl: `${baseUrl}/api/connect/bridge-session/refresh`,
					accountLabel: "Stress Harness",
					plan: "solo",
					serverName: "bardo",
				});
			}

			if (url.pathname === "/api/connect/bridge-session/refresh") {
				return Response.json({
					accessToken,
					refreshToken,
					expiresAt: "2099-04-10T12:00:00.000Z",
					mcpUrl: `${baseUrl}/mcp`,
					statusUrl: `${baseUrl}/api/connect/runtime-status`,
					refreshUrl: `${baseUrl}/api/connect/bridge-session/refresh`,
					accountLabel: "Stress Harness",
					plan: "solo",
					serverName: "bardo",
				});
			}

			if (url.pathname === "/api/connect/runtime-status") {
				const authorization = request.headers.get("authorization") ?? "";
				if (authorization !== `Bearer ${accessToken}`) {
					return Response.json(
						{ valid: false, error: "Missing or invalid access token." },
						{ status: 401 },
					);
				}
				return Response.json({
					valid: true,
					subjectId: "user_stress",
					keyId: "key_stress",
					scopes: ["mcp"],
					workspacePath: "./customers/user_stress",
					plan: "solo",
					mcpPeriodLimit: 25_000,
					billingUnavailable: false,
				});
			}

			if (url.pathname === "/health") {
				return Response.json({ ok: true });
			}

			if (url.pathname.startsWith("/dashboard/connect/bridge/")) {
				return new Response("<html><body>Bridge approved.</body></html>", {
					status: 200,
					headers: { "content-type": "text/html; charset=utf-8" },
				});
			}

			return new Response("Not found", { status: 404 });
		},
	});

	return {
		baseUrl,
		stop() {
			server.stop(true);
		},
	};
}

async function withMcpClient<T>(args: {
	bardoBin: string;
	workspaceRoot: string;
	callback: (client: Client) => Promise<T>;
}): Promise<T> {
	const client = new Client(
		{
			name: "stress-harness",
			version: "1.0.0",
		},
		{
			capabilities: {},
		},
	);
	const transport = new StdioClientTransport({
		command: args.bardoBin,
		args: ["mcp", "serve", "--workspace-root", args.workspaceRoot],
		cwd: args.workspaceRoot,
		stderr: "pipe",
	});

	try {
		await client.connect(transport);
		return await args.callback(client);
	} finally {
		await client.close();
	}
}

async function recordScenario(
	results: ScenarioResult[],
	name: string,
	fn: () => Promise<string>,
): Promise<void> {
	const startedAt = Date.now();
	try {
		const details = await fn();
		results.push({
			name,
			ok: true,
			details,
			durationMs: Date.now() - startedAt,
		});
		console.log(`PASS ${name}: ${details}`);
	} catch (error) {
		const details = error instanceof Error ? error.message : String(error);
		results.push({
			name,
			ok: false,
			details,
			durationMs: Date.now() - startedAt,
		});
		console.error(`FAIL ${name}: ${details}`);
	}
}

async function main() {
	const version = await resolveVersion();
	const results: ScenarioResult[] = [];

	await rm(SANDBOX_ROOT, { recursive: true, force: true });
	await mkdir(SANDBOX_ROOT, { recursive: true });

	const installRoot = path.join(SANDBOX_ROOT, "install-root");
	const binDir = path.join(SANDBOX_ROOT, "bin");
	const workspacesRoot = path.join(SANDBOX_ROOT, "workspaces");
	await mkdir(workspacesRoot, { recursive: true });

	await recordScenario(results, "fresh release build", async () => {
		await runCommand({
			command: process.execPath,
			commandArgs: [
				"run",
				"--cwd",
				path.join(REPO_ROOT, "packages", "bardo-mcp"),
				"build:release",
			],
			cwd: REPO_ROOT,
			env: process.env,
		});
		return "rebuilt packages/bardo-mcp/dist/release from the current local sources";
	});

	const supportServer = await startSupportServer(version);
	try {
		const installScriptPath = path.join(SANDBOX_ROOT, "install-bardo.sh");
		await writeFile(installScriptPath, renderUnixInstallScript(), "utf8");
		await runCommand({
			command: "chmod",
			commandArgs: ["+x", installScriptPath],
			cwd: SANDBOX_ROOT,
		});

		await recordScenario(results, "release-binary install", async () => {
			await runCommand({
				command: "sh",
				commandArgs: [installScriptPath],
				cwd: SANDBOX_ROOT,
				env: {
					...process.env,
					BARDO_INSTALL_ROOT: installRoot,
					BARDO_BIN_DIR: binDir,
					BARDO_INSTALL_RELEASE_BASE_URL: `${supportServer.baseUrl}/releases/${version}`,
				},
			});
			const bardoBin = path.join(binDir, "bardo");
			assert(
				(await stat(bardoBin)).isFile(),
				"Installed bardo binary wrapper is missing.",
			);
			return `installed ${bardoBin}`;
		});

		const bardoBin = path.join(binDir, "bardo");
		const commonEnv = (workspaceRoot: string): NodeJS.ProcessEnv => ({
			...process.env,
			BARDO_ACCESS_TOKEN: undefined,
			BARDO_API_KEY: undefined,
			BARDO_CONFIG_DIR: path.join(workspaceRoot, ".config", "bardo"),
			BARDO_LOGIN_START_URL: `${supportServer.baseUrl}/api/connect/bridge-session/start`,
			BARDO_MCP_URL: undefined,
			BARDO_RUNTIME_STATUS_URL: undefined,
			BARDO_BRIDGE_SESSION_REFRESH_URL: undefined,
		});

		await recordScenario(results, "ready workspace cli flow", async () => {
			const workspaceRoot = path.join(workspacesRoot, "ready");
			await copyFixture("ready", workspaceRoot);

			const login = await runCommand({
				command: bardoBin,
				commandArgs: ["login"],
				cwd: workspaceRoot,
				env: commonEnv(workspaceRoot),
			});
			assert(
				login.stdout.includes("/dashboard/connect/bridge/"),
				"Login output did not include the browser approval URL.",
			);

			await runCommand({
				command: bardoBin,
				commandArgs: ["init", "--ruleset", "shadowdark"],
				cwd: workspaceRoot,
				env: commonEnv(workspaceRoot),
			});
			await runCommand({
				command: bardoBin,
				commandArgs: [
					"connect",
					"--client",
					"codex",
					"--ruleset",
					"shadowdark",
				],
				cwd: workspaceRoot,
				env: commonEnv(workspaceRoot),
			});

			const doctor = await runCommand({
				command: bardoBin,
				commandArgs: ["doctor", "--client", "codex", "--json"],
				cwd: workspaceRoot,
				env: commonEnv(workspaceRoot),
			});
			const doctorPayload = JSON.parse(doctor.stdout) as {
				workspace: { initialized: boolean };
				connectivity: { health: { ok: boolean } };
				account: { ok: boolean; plan: string | null };
			};
			assert(
				doctorPayload.workspace.initialized,
				"Doctor reported an uninitialized workspace.",
			);
			assert(
				doctorPayload.connectivity.health.ok,
				"Doctor reported failing local health.",
			);
			assert(
				doctorPayload.account.ok,
				"Doctor could not confirm account status.",
			);
			assert(
				doctorPayload.account.plan === "solo",
				"Doctor did not preserve the staged plan.",
			);

			const clients = await runCommand({
				command: bardoBin,
				commandArgs: ["clients", "list", "--json"],
				cwd: workspaceRoot,
				env: commonEnv(workspaceRoot),
			});
			const clientList = JSON.parse(clients.stdout) as Array<{ id: string }>;
			assert(
				clientList.some((client) => client.id === "codex"),
				"Supported clients output did not include Codex.",
			);

			const readiness = JSON.parse(
				await readFile(
					path.join(workspaceRoot, ".bardo", "manifests", "readiness.json"),
					"utf8",
				),
			) as { status: string };
			assert(
				readiness.status === "ready",
				"Ready fixture did not bootstrap to ready.",
			);

			await withMcpClient({
				bardoBin,
				workspaceRoot,
				callback: async (client) => {
					const tools = await client.listTools();
					for (const name of [
						"init",
						"scene_turn",
						"player_action",
						"user_correction",
						"world_sync",
						"simulation_tick",
					]) {
						assert(
							tools.tools.some((tool) => tool.name === name),
							`Tool list is missing ${name}.`,
						);
					}

					const sceneTurn = await client.callTool({
						name: "scene_turn",
						arguments: {
							playerIntent:
								"Scout the collapsed bridge without altering canon.",
						},
					});
					assert(
						!sceneTurn.isError,
						"scene_turn failed in the ready workspace.",
					);
				},
			});

			return "login, init, connect, doctor, clients list, and scene_turn all succeeded";
		});

		await recordScenario(
			results,
			"opencode client config and discovery",
			async () => {
				const workspaceRoot = path.join(workspacesRoot, "opencode");
				await copyFixture("ready", workspaceRoot);

				await runCommand({
					command: bardoBin,
					commandArgs: ["login"],
					cwd: workspaceRoot,
					env: commonEnv(workspaceRoot),
				});
				await runCommand({
					command: bardoBin,
					commandArgs: [
						"connect",
						"--client",
						"opencode",
						"--ruleset",
						"shadowdark",
					],
					cwd: workspaceRoot,
					env: commonEnv(workspaceRoot),
				});

				const doctor = await runCommand({
					command: bardoBin,
					commandArgs: ["doctor", "--client", "opencode", "--json"],
					cwd: workspaceRoot,
					env: commonEnv(workspaceRoot),
				});
				const doctorPayload = JSON.parse(doctor.stdout) as {
					client: {
						configExists: boolean;
						configValid: boolean;
						hasBardoServer: boolean;
					} | null;
				};
				assert(
					doctorPayload.client?.configExists,
					"Doctor did not find opencode.json.",
				);
				assert(
					doctorPayload.client?.configValid,
					"Doctor reported an invalid OpenCode config.",
				);
				assert(
					doctorPayload.client?.hasBardoServer,
					"Doctor did not detect the Bardo OpenCode server entry.",
				);

				const opencodeConfig = JSON.parse(
					await readFile(path.join(workspaceRoot, "opencode.json"), "utf8"),
				) as {
					mcp: Record<
						string,
						{ type: string; command: string[]; enabled: boolean }
					>;
				};
				assert(
					opencodeConfig.mcp.bardo.type === "local",
					"OpenCode config was not local.",
				);
				assert(
					opencodeConfig.mcp.bardo.enabled,
					"OpenCode config left Bardo disabled.",
				);

				const mcpList = await runCommand({
					command: process.execPath,
					commandArgs: ["x", "-y", "opencode-ai", "mcp", "list"],
					cwd: workspaceRoot,
					env: {
						...commonEnv(workspaceRoot),
						PATH: `${binDir}:${process.env.PATH ?? ""}`,
					},
				});
				assert(
					mcpList.stdout.includes("bardo") &&
						mcpList.stdout.includes("connected"),
					"OpenCode did not discover the connected local Bardo server.",
				);

				return "connect writes opencode.json and OpenCode discovers the local Bardo MCP";
			},
		);

		await recordScenario(
			results,
			"first-class client setup stays one-command simple",
			async () => {
				const clientConfigs = {
					codex: ".codex/config.toml",
					claude: ".mcp.json",
					cursor: ".cursor/mcp.json",
					gemini: ".gemini/settings.json",
				} as const;

				for (const [client, relativeConfigPath] of Object.entries(
					clientConfigs,
				)) {
					const workspaceRoot = path.join(workspacesRoot, `client-${client}`);
					await copyFixture("ready", workspaceRoot);

					await runCommand({
						command: bardoBin,
						commandArgs: ["login"],
						cwd: workspaceRoot,
						env: commonEnv(workspaceRoot),
					});
					await runCommand({
						command: bardoBin,
						commandArgs: [
							"connect",
							"--client",
							client,
							"--ruleset",
							"shadowdark",
						],
						cwd: workspaceRoot,
						env: commonEnv(workspaceRoot),
					});

					assert(
						await pathExists(path.join(workspaceRoot, relativeConfigPath)),
						`${client} config was not written to ${relativeConfigPath}.`,
					);

					const doctor = await runCommand({
						command: bardoBin,
						commandArgs: ["doctor", "--client", client, "--json"],
						cwd: workspaceRoot,
						env: commonEnv(workspaceRoot),
					});
					const doctorPayload = JSON.parse(doctor.stdout) as {
						client: {
							configExists: boolean;
							configValid: boolean;
							hasBardoServer: boolean;
						} | null;
					};
					assert(
						doctorPayload.client?.configExists,
						`Doctor did not find the ${client} config.`,
					);
					assert(
						doctorPayload.client?.configValid,
						`Doctor reported an invalid ${client} config.`,
					);
					assert(
						doctorPayload.client?.hasBardoServer,
						`Doctor did not detect the Bardo server in the ${client} config.`,
					);
				}

				return "Codex, Claude, Cursor, and Gemini all connect with the same login/init/connect flow";
			},
		);

		await recordScenario(results, "missing rulebook failure", async () => {
			const workspaceRoot = path.join(workspacesRoot, "missing-rulebook");
			await mkdir(workspaceRoot, { recursive: true });
			const result = await runCommandAllowFailure({
				command: bardoBin,
				commandArgs: ["init", "--ruleset", "shadowdark"],
				cwd: workspaceRoot,
				env: commonEnv(workspaceRoot),
			});
			assert(
				result.status !== 0,
				"Init unexpectedly succeeded without a rulebook.",
			);
			assert(
				`${result.stdout}\n${result.stderr}`.includes(
					"Rules bootstrap requires rulebook.md",
				),
				"Missing rulebook failure did not explain the required rulebook contract.",
			);
			return "init fails closed when rulebook.md is missing";
		});

		await recordScenario(
			results,
			"invalid rulebook override failure",
			async () => {
				const workspaceRoot = path.join(workspacesRoot, "invalid-rulebook");
				await mkdir(workspaceRoot, { recursive: true });
				await writeFile(
					path.join(workspaceRoot, "rulebook.pdf"),
					"not a pdf",
					"utf8",
				);
				const result = await runCommandAllowFailure({
					command: bardoBin,
					commandArgs: [
						"init",
						"--ruleset",
						"shadowdark",
						"--rulebook",
						"./rulebook.pdf",
					],
					cwd: workspaceRoot,
					env: commonEnv(workspaceRoot),
				});
				assert(
					result.status !== 0,
					"Init unexpectedly accepted a PDF rulebook override.",
				);
				assert(
					`${result.stdout}\n${result.stderr}`.includes(
						"supports markdown or text sources only",
					),
					"Invalid rulebook failure did not explain the supported source types.",
				);
				return "unsupported rulebook override is rejected";
			},
		);

		await recordScenario(results, "legacy layout migration", async () => {
			const workspaceRoot = path.join(workspacesRoot, "legacy-migration");
			await mkdir(path.join(workspaceRoot, "bardo"), { recursive: true });
			await writeFile(
				path.join(workspaceRoot, "bardo", "legacy-marker.txt"),
				"legacy state",
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, "rulebook.md"),
				"# Legacy Rulebook\n\nTravel matters.",
				"utf8",
			);

			await runCommand({
				command: bardoBin,
				commandArgs: ["init", "--ruleset", "shadowdark"],
				cwd: workspaceRoot,
				env: commonEnv(workspaceRoot),
			});

			assert(
				(
					await stat(path.join(workspaceRoot, ".bardo", "legacy-marker.txt"))
				).isFile(),
				"Legacy bardo/ contents were not migrated into .bardo/.",
			);
			assert(
				!(await pathExists(path.join(workspaceRoot, "bardo"))),
				"Legacy bardo/ directory still exists after migration.",
			);
			return "legacy bardo/ root migrated one-way into .bardo/";
		});

		await recordScenario(
			results,
			"messy workspace readiness and runtime",
			async () => {
				const workspaceRoot = path.join(workspacesRoot, "messy");
				await copyFixture("messy", workspaceRoot);

				await runCommand({
					command: bardoBin,
					commandArgs: ["init", "--ruleset", "shadowdark"],
					cwd: workspaceRoot,
					env: commonEnv(workspaceRoot),
				});

				const readiness = JSON.parse(
					await readFile(
						path.join(workspaceRoot, ".bardo", "manifests", "readiness.json"),
						"utf8",
					),
				) as { status: string; gaps: string[] };
				assert(
					readiness.status === "ready-with-gaps",
					"Messy workspace should produce ready-with-gaps readiness.",
				);
				assert(
					readiness.gaps.some((gap) => gap.includes("contradictory")),
					"Messy workspace did not surface contradictory location gaps.",
				);

				await withMcpClient({
					bardoBin,
					workspaceRoot,
					callback: async (client) => {
						const validSync = await client.callTool({
							name: "world_sync",
							arguments: {
								currentLocation: "River Market",
								activeQuests: ["Find the ferryman before the eclipse"],
								relevantFactions: ["Dock Wardens"],
							},
						});
						assert(
							!validSync.isError,
							"Grounded world_sync unexpectedly failed.",
						);
						assert(
							readCommittedFlag(validSync.structuredContent) === true,
							"Grounded world_sync did not commit canon conservatively.",
						);

						const invalidSync = await client.callTool({
							name: "world_sync",
							arguments: {
								currentLocation: "Moonlit Vault",
							},
						});
						assert(
							!invalidSync.isError,
							"Ungrounded world_sync should return uncertainty, not crash.",
						);
						assert(
							readCommittedFlag(invalidSync.structuredContent) === false,
							"Ungrounded world_sync should not commit canon.",
						);
					},
				});

				return "messy readiness stayed explicit and runtime only committed grounded canon";
			},
		);

		await recordScenario(
			results,
			"user correction precedence and continuity",
			async () => {
				const workspaceRoot = path.join(workspacesRoot, "correction-flow");
				await copyFixture("ready", workspaceRoot);

				await runCommand({
					command: bardoBin,
					commandArgs: ["init", "--ruleset", "shadowdark"],
					cwd: workspaceRoot,
					env: commonEnv(workspaceRoot),
				});

				await withMcpClient({
					bardoBin,
					workspaceRoot,
					callback: async (client) => {
						const correction = await client.callTool({
							name: "user_correction",
							arguments: {
								correction:
									"The party reached Ash Court already; River Market was stale narration.",
								currentLocation: "Ash Court",
							},
						});
						assert(!correction.isError, "user_correction should succeed.");
						assert(
							readCommittedFlag(correction.structuredContent) === true,
							"user_correction did not commit the corrected canon.",
						);

						const conflictingSync = await client.callTool({
							name: "world_sync",
							arguments: {
								currentLocation: "River Market",
							},
						});
						assert(
							!conflictingSync.isError,
							"Conflicting world_sync should fail conservatively instead of crashing.",
						);
						assert(
							readCommittedFlag(conflictingSync.structuredContent) === false,
							"Conflicting world_sync should not override explicit user correction.",
						);
					},
				});

				return "explicit user correction outranked later conflicting runtime sync";
			},
		);

		await recordScenario(
			results,
			"incomplete workspace readiness",
			async () => {
				const workspaceRoot = path.join(workspacesRoot, "incomplete");
				await copyFixture("incomplete", workspaceRoot);

				await runCommand({
					command: bardoBin,
					commandArgs: ["init", "--ruleset", "shadowdark"],
					cwd: workspaceRoot,
					env: commonEnv(workspaceRoot),
				});

				const readiness = JSON.parse(
					await readFile(
						path.join(workspaceRoot, ".bardo", "manifests", "readiness.json"),
						"utf8",
					),
				) as { status: string; gaps: string[] };
				assert(
					readiness.status === "needs-user-input",
					"Incomplete workspace should remain needs-user-input.",
				);
				assert(
					readiness.gaps.some((gap) =>
						gap.includes("Current location is missing"),
					),
					"Incomplete workspace did not preserve the missing-location gap.",
				);
				return "incomplete workspace stays blocked instead of inventing readiness";
			},
		);

		await recordScenario(
			results,
			"oversized and unsupported input handling",
			async () => {
				const workspaceRoot = path.join(workspacesRoot, "oversized");
				await copyFixture("ready", workspaceRoot);
				await writeFile(
					path.join(workspaceRoot, "oversized-notes.md"),
					`# Oversized\n\n${"lore ".repeat(140_000)}`,
					"utf8",
				);
				await writeFile(
					path.join(workspaceRoot, "ignored-art.png"),
					Buffer.from([0, 1, 2, 3, 4, 5]),
				);

				await runCommand({
					command: bardoBin,
					commandArgs: ["init", "--ruleset", "shadowdark"],
					cwd: workspaceRoot,
					env: commonEnv(workspaceRoot),
				});

				const readiness = JSON.parse(
					await readFile(
						path.join(workspaceRoot, ".bardo", "manifests", "readiness.json"),
						"utf8",
					),
				) as { status: string; gaps: string[] };
				assert(
					readiness.status === "ready-with-gaps",
					"Oversized workspace should remain bootstrapped with explicit gaps.",
				);
				assert(
					readiness.gaps.some((gap) =>
						gap.includes("Skipped oversized source"),
					),
					"Oversized file was not surfaced as a readiness gap.",
				);

				const sourceIndex = JSON.parse(
					await readFile(
						path.join(
							workspaceRoot,
							".bardo",
							"manifests",
							"source-index.json",
						),
						"utf8",
					),
				) as { sources: Array<{ relativePath: string }> };
				assert(
					!sourceIndex.sources.some(
						(source) => source.relativePath === "ignored-art.png",
					),
					"Unsupported binary files should be ignored by the first-pass discovery index.",
				);
				return "oversized files are skipped safely and unsupported binaries are ignored";
			},
		);

		await recordScenario(
			results,
			"corrupted artifact fails closed",
			async () => {
				const workspaceRoot = path.join(workspacesRoot, "corrupted");
				await copyFixture("ready", workspaceRoot);
				await runCommand({
					command: bardoBin,
					commandArgs: ["init", "--ruleset", "shadowdark"],
					cwd: workspaceRoot,
					env: commonEnv(workspaceRoot),
				});
				await writeFile(
					path.join(workspaceRoot, ".bardo", "state", "current-state.json"),
					"{ this is not valid json",
					"utf8",
				);

				await withMcpClient({
					bardoBin,
					workspaceRoot,
					callback: async (client) => {
						const result = await client.callTool({
							name: "scene_turn",
							arguments: { playerIntent: "Advance carefully." },
						});
						assert(
							result.isError,
							"Corrupted artifacts should fail closed instead of succeeding.",
						);
					},
				});
				return "corrupted runtime artifacts stop play instead of mutating canon";
			},
		);

		await recordScenario(
			results,
			"repeated init/connect idempotency",
			async () => {
				const workspaceRoot = path.join(workspacesRoot, "idempotent");
				await copyFixture("ready", workspaceRoot);
				await runCommand({
					command: bardoBin,
					commandArgs: ["login"],
					cwd: workspaceRoot,
					env: commonEnv(workspaceRoot),
				});

				for (let index = 0; index < 2; index += 1) {
					await runCommand({
						command: bardoBin,
						commandArgs: ["init", "--ruleset", "shadowdark"],
						cwd: workspaceRoot,
						env: commonEnv(workspaceRoot),
					});
					await runCommand({
						command: bardoBin,
						commandArgs: [
							"connect",
							"--client",
							"codex",
							"--ruleset",
							"shadowdark",
						],
						cwd: workspaceRoot,
						env: commonEnv(workspaceRoot),
					});
				}

				const manifest = JSON.parse(
					await readFile(
						path.join(workspaceRoot, ".bardo", "manifest.json"),
						"utf8",
					),
				) as { importedRulebooks?: string[] };
				assert(
					Array.isArray(manifest.importedRulebooks) &&
						manifest.importedRulebooks.includes("rules/rulebook.md"),
					"Repeated init/connect cycles lost the preserved rulebook import.",
				);
				return "repeated init/connect cycles remain stable";
			},
		);
	} finally {
		supportServer.stop();
	}

	const reportPath = path.join(SANDBOX_ROOT, "stress-report.json");
	await writeFile(
		reportPath,
		JSON.stringify(
			{
				generatedAtISO: new Date().toISOString(),
				version,
				evaluationScorecard: {
					totalScenarios: results.length,
					passedScenarios: results.filter((result) => result.ok).length,
					failedScenarios: results.filter((result) => !result.ok).length,
				},
				results,
			},
			null,
			2,
		),
		"utf8",
	);

	const failed = results.filter((result) => !result.ok);
	console.log(`\nStress report written to ${reportPath}`);
	console.log(
		`${results.length - failed.length}/${results.length} scenarios passed.`,
	);

	if (failed.length > 0) {
		process.exitCode = 1;
	}
}

await main();
