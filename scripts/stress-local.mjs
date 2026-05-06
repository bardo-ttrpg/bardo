import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliPath = path.join(repoRoot, "packages", "mcp", "dist", "cli.mjs");
const clients = ["codex", "claude", "opencode", "gemini", "cursor"];

function runCli(args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [cliPath, ...args], {
			cwd: options.cwd,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, ...options.env },
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0 || options.allowFailure) {
				resolve({ code, stdout, stderr });
				return;
			}
			reject(
				new Error(
					`Command failed (${code}): node ${cliPath} ${args.join(" ")}\n${stdout}\n${stderr}`,
				),
			);
		});
	});
}

function encodeMessage(message) {
	return `${JSON.stringify(message)}\n`;
}

function decodeMessages(buffer) {
	const messages = [];
	for (const line of buffer.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		messages.push(JSON.parse(trimmed));
	}
	return messages;
}

async function listMcpTools(workspaceRoot) {
	const child = spawn(
		process.execPath,
		[cliPath, "mcp", "serve", "--workspace-root", workspaceRoot],
		{ stdio: ["pipe", "pipe", "pipe"] },
	);
	let stdout = "";
	let stderr = "";
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	child.stdin.write(
		encodeMessage({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2025-06-18",
				capabilities: {},
				clientInfo: { name: "bardo-stress-local", version: "0.1.0" },
			},
		}),
	);
	child.stdin.write(
		encodeMessage({
			jsonrpc: "2.0",
			method: "notifications/initialized",
			params: {},
		}),
	);
	child.stdin.write(
		encodeMessage({
			jsonrpc: "2.0",
			id: 2,
			method: "tools/list",
			params: {},
		}),
	);

	await new Promise((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error("MCP smoke timed out")),
			5000,
		);
		const interval = setInterval(() => {
			const messages = decodeMessages(stdout);
			if (messages.some((message) => message.id === 2)) {
				clearInterval(interval);
				clearTimeout(timeout);
				resolve();
			}
		}, 50);
	});
	child.kill();
	const listResponse = decodeMessages(stdout).find(
		(message) => message.id === 2,
	);
	if (!listResponse?.result?.tools?.length) {
		throw new Error(
			`MCP tools/list returned no tools.\nstdout=${stdout}\nstderr=${stderr}`,
		);
	}
	return listResponse.result.tools.map((tool) => tool.name);
}

const workspace = await mkdtemp(path.join(tmpdir(), "bardo-stress-"));

try {
	await writeFile(
		path.join(workspace, "rulebook.md"),
		[
			"# Rules",
			"## Checks",
			"Roll a d20 and add the relevant ability modifier.",
			"## Consequences",
			"Record lasting injuries, faction reactions, and clock progress.",
		].join("\n"),
	);
	await writeFile(
		path.join(workspace, "campaign-notes.md"),
		[
			"# Campaign",
			"Current location: Lanternford.",
			"Character: Mira Valen, cautious cartographer.",
			"Faction: Ash Choir, hostile after the bridge collapse.",
		].join("\n"),
	);

	await runCli(["init", "--workspace-root", workspace]);
	const validate = await runCli(["validate", "--workspace-root", workspace], {
		allowFailure: true,
	});
	if (!validate.stdout.includes("Readiness:")) {
		throw new Error("validate did not print readiness.");
	}
	const doctor = await runCli(["doctor", "--workspace-root", workspace]);
	if (!doctor.stdout.includes("Account required for local use: no")) {
		throw new Error("doctor did not confirm local use avoids account auth.");
	}

	for (const client of clients) {
		const result = await runCli([
			"connect",
			"--client",
			client,
			"--workspace-root",
			workspace,
		]);
		if (/bridge|runtime-status|token|api-key|auth/i.test(result.stdout)) {
			throw new Error(`Unexpected hosted/auth language in ${client} output.`);
		}
	}

	const generatedFiles = [
		".codex/config.toml",
		".mcp.json",
		"opencode.json",
		".gemini/settings.json",
		".cursor/mcp.json",
	];
	for (const relativePath of generatedFiles) {
		const content = await readFile(path.join(workspace, relativePath), "utf8");
		if (!content.includes("bardo") || !content.includes("mcp")) {
			throw new Error(
				`${relativePath} does not contain the local Bardo MCP command.`,
			);
		}
		if (/bridge|runtime-status|token|api-key|Authorization/i.test(content)) {
			throw new Error(`${relativePath} contains hosted/auth configuration.`);
		}
	}

	const tools = await listMcpTools(workspace);
	for (const requiredTool of ["bardo_workspace_status", "init", "scene_turn"]) {
		if (!tools.includes(requiredTool)) {
			throw new Error(`MCP tools/list is missing ${requiredTool}.`);
		}
	}

	console.log(
		`Bardo local stress passed for ${clients.length} clients and ${tools.length} MCP tools.`,
	);
} finally {
	await rm(workspace, { recursive: true, force: true });
}
