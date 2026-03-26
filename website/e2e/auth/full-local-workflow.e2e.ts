import { type ChildProcess, spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const LIVE_E2E = process.env.BARDO_FULL_LIVE_E2E === "1";
const WORKSPACE_ROOT = "/home/armando/projects/01-bardo-test/workspace";
const HOME_DIR = "/home/armando/projects/01-bardo-test/.home";
const MCP_PORT = "3100";
const WEBSITE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";
const MCP_URL = `http://127.0.0.1:${MCP_PORT}/mcp`;
const RUNTIME_STATUS_URL = `${WEBSITE_URL}/api/connect/runtime-status`;
test.skip(!LIVE_E2E, "Run only for explicit local live workflow verification.");

function spawnLoggedProcess(args: {
	command: string;
	cwd: string;
	env?: Record<string, string>;
	logPath: string;
}) {
	const child = spawn(args.command, {
		cwd: args.cwd,
		env: { ...process.env, ...args.env },
		shell: true,
		stdio: ["ignore", "pipe", "pipe"],
	});
	child.stdout.on("data", (chunk) => {
		appendFileSync(args.logPath, chunk);
	});
	child.stderr.on("data", (chunk) => {
		appendFileSync(args.logPath, chunk);
	});
	return child;
}

async function stopProcess(child: ChildProcess | null) {
	if (!child || child.exitCode !== null) {
		return;
	}
	child.kill("SIGTERM");
	await new Promise((resolve) => setTimeout(resolve, 1_000));
	if (child.exitCode === null) {
		child.kill("SIGKILL");
	}
}

async function waitForUrl(url: string, timeoutMs = 60_000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(5_000),
			});
			if (response.ok) {
				return;
			}
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 1_000));
	}
	throw new Error(`Timed out waiting for ${url}`);
}

async function waitForPaidPlan(page: import("@playwright/test").Page) {
	for (let attempt = 0; attempt < 30; attempt += 1) {
		const billing = await page.evaluate(async () => {
			const response = await fetch("/api/billing");
			return await response.json();
		});
		const plan = billing?.billing?.plan;
		if (plan === "solo") {
			return plan;
		}
		await page.waitForTimeout(2_000);
	}
	throw new Error(
		"Timed out waiting for Clerk Billing to reflect a paid plan.",
	);
}

async function ensurePaidSubscription(page: import("@playwright/test").Page) {
	const billing = await page.evaluate(async () => {
		const response = await fetch("/api/billing");
		return await response.json();
	});
	const currentPlan = billing?.billing?.plan;
	if (currentPlan === "solo") {
		return currentPlan;
	}

	await page.goto("/pricing");
	await page.getByRole("button", { name: /start solo/i }).click();
	await page.getByRole("button", { name: /pay with test card/i }).click();
	await page.getByRole("button", { name: /pay \$14\.99/i }).click();
	return await waitForPaidPlan(page);
}

async function startApprovedBridgeSession(
	page: import("@playwright/test").Page,
) {
	const session = await page.evaluate(async () => {
		const startResponse = await fetch("/api/connect/bridge-session/start", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({}),
		});
		const started = (await startResponse.json()) as {
			sessionId?: string;
			pollUrl?: string;
			error?: string;
		};
		if (!startResponse.ok || !started.sessionId || !started.pollUrl) {
			throw new Error(started.error ?? "Failed to start bridge session.");
		}

		const approveResponse = await fetch("/api/connect/bridge-session/approve", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({ sessionId: started.sessionId }),
		});
		const approved = (await approveResponse.json()) as {
			ok?: boolean;
			error?: string;
		};
		if (!approveResponse.ok || approved.ok !== true) {
			throw new Error(approved.error ?? "Failed to approve bridge session.");
		}

		for (let attempt = 0; attempt < 10; attempt += 1) {
			const pollResponse = await fetch(started.pollUrl);
			const pollBody = (await pollResponse.json()) as {
				status?: string;
				accessToken?: string;
				refreshToken?: string;
				plan?: string;
				statusUrl?: string;
				error?: string;
			};
			if (
				pollResponse.ok &&
				pollBody.status === "approved" &&
				typeof pollBody.accessToken === "string" &&
				typeof pollBody.statusUrl === "string"
			) {
				return {
					accessToken: pollBody.accessToken,
					refreshToken: pollBody.refreshToken ?? null,
					plan: pollBody.plan ?? "free",
					statusUrl: pollBody.statusUrl,
				};
			}
			if (pollBody.status !== "pending") {
				throw new Error(pollBody.error ?? "Bridge session poll failed.");
			}
			await new Promise((resolve) => setTimeout(resolve, 1_000));
		}
		throw new Error("Timed out waiting for bridge approval.");
	});

	return session;
}

async function runCli(args: string[], _cwd: string) {
	const child = spawn(
		"/home/armando/.bun/bin/bun",
		["run", "src/cli.ts", ...args],
		{
			cwd: "/home/armando/projects/bardo/packages/bardo-mcp",
			env: {
				...process.env,
				HOME: HOME_DIR,
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);

	let stdout = "";
	let stderr = "";
	child.stdout.on("data", (chunk) => {
		stdout += chunk.toString();
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk.toString();
	});

	const exitCode = await new Promise<number>((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => resolve(code ?? 1));
	});

	return { exitCode, stdout, stderr };
}

test("runs the paid remote MCP workflow end to end against a fresh WSL workspace", async ({
	page,
}) => {
	test.setTimeout(300_000);
	const logDir = "/home/armando/projects/01-bardo-test/logs";
	await mkdir(logDir, { recursive: true });
	await rm(WORKSPACE_ROOT, { recursive: true, force: true });
	await rm(HOME_DIR, { recursive: true, force: true });
	await mkdir(WORKSPACE_ROOT, { recursive: true });
	await mkdir(HOME_DIR, { recursive: true });

	const mcpServer = spawnLoggedProcess({
		command: `PORT=${MCP_PORT} /home/armando/.bun/bin/bun run index.ts`,
		cwd: "/home/armando/projects/bardo/mcp",
		env: {
			BARDO_AUTH_INTROSPECTION_URL: `${WEBSITE_URL}/api/auth/introspect-key`,
		},
		logPath: path.join(logDir, "full-local-workflow-mcp.log"),
	});

	try {
		console.log("step: wait local mcp");
		await waitForUrl(`http://127.0.0.1:${MCP_PORT}/health`);

		console.log("step: dashboard");
		await page.goto("/dashboard");
		console.log("step: ensure paid subscription");
		const paidPlan = await ensurePaidSubscription(page);
		expect(paidPlan).toBe("solo");

		console.log("step: approve bridge");
		const bridge = await startApprovedBridgeSession(page);
		expect(bridge.plan).toBe("solo");

		console.log("step: runtime status");
		const runtimeStatus = await page.evaluate(async (token) => {
			const response = await fetch("/api/connect/runtime-status", {
				headers: {
					authorization: `Bearer ${token}`,
				},
			});
			return {
				status: response.status,
				body: await response.json(),
			};
		}, bridge.accessToken);
		expect(runtimeStatus.status).toBe(200);
		expect(runtimeStatus.body.valid).toBe(true);
		expect(runtimeStatus.body.plan).toBe(paidPlan);

		console.log("step: cli login");
		const loginResult = await runCli(
			[
				"login",
				"--api-key",
				bridge.accessToken,
				"--url",
				MCP_URL,
				"--status-url",
				RUNTIME_STATUS_URL,
			],
			WORKSPACE_ROOT,
		);
		expect(loginResult.exitCode).toBe(0);
		expect(loginResult.stdout).toContain("Saved Bardo credentials");

		console.log("step: cli connect");
		const connectResult = await runCli(
			[
				"connect",
				"--client",
				"codex",
				"--workspace-root",
				WORKSPACE_ROOT,
				"--ruleset",
				"shadowdark",
			],
			WORKSPACE_ROOT,
		);
		expect(connectResult.exitCode).toBe(0);

		console.log("step: cli doctor");
		const doctorResult = await runCli(
			["doctor", "--workspace-root", WORKSPACE_ROOT, "--json"],
			WORKSPACE_ROOT,
		);
		console.log("doctor stdout", doctorResult.stdout);
		console.log("doctor stderr", doctorResult.stderr);
		expect(doctorResult.exitCode).toBe(0);
		const doctor = JSON.parse(doctorResult.stdout) as {
			auth: { configured: boolean };
			workspace: { initialized: boolean };
			account: { ok: boolean; plan: string | null };
		};
		expect(doctor.auth.configured).toBe(true);
		expect(doctor.workspace.initialized).toBe(true);
		expect(doctor.account.ok).toBe(true);
		expect(doctor.account.plan).toBe(paidPlan);

		console.log("step: clients list");
		const clientsListResult = await runCli(
			["clients", "list", "--json"],
			WORKSPACE_ROOT,
		);
		expect(clientsListResult.exitCode).toBe(0);
		expect(clientsListResult.stdout).toContain('"id": "codex"');

		console.log("step: initialize remote mcp with workspace root");
		const initialize = await fetch(MCP_URL, {
			method: "POST",
			headers: {
				authorization: `Bearer ${bridge.accessToken}`,
				"x-bardo-workspace-root": WORKSPACE_ROOT,
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-06-18",
					capabilities: {},
					clientInfo: { name: "full-local-workflow", version: "1.0.0" },
				},
			}),
		});
		expect(initialize.status).toBe(200);
		const mcpSessionId = initialize.headers.get("mcp-session-id");
		expect(mcpSessionId).toBeTruthy();

		console.log("step: protected tool call");
		const toolCall = await fetch(MCP_URL, {
			method: "POST",
			headers: {
				authorization: `Bearer ${bridge.accessToken}`,
				"x-bardo-workspace-root": WORKSPACE_ROOT,
				"mcp-session-id": mcpSessionId ?? "",
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/call",
				params: {
					name: "world_state_overview",
					arguments: {},
				},
			}),
		});
		expect(toolCall.status).toBe(200);
		const toolCallBody = await toolCall.text();
		expect(toolCallBody).toContain("World State Overview");

		const manifest = JSON.parse(
			await readFile(
				path.join(WORKSPACE_ROOT, "bardo", "manifest.json"),
				"utf8",
			),
		) as {
			workspaceRoot?: string;
		};
		expect(manifest.workspaceRoot).toBe(WORKSPACE_ROOT);
	} finally {
		await stopProcess(mcpServer);
	}
});
