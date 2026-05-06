import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	type AutoInstallConnectionClient,
	buildInstallConfigContent,
	listConnectionClientAdapters,
} from "./client-adapters";
import { resolveAutoInstallClientSelection } from "./client-resolution";
import {
	ensureWorkspaceCoreFiles,
	maybeImportRulebook,
	startLocalMcpServer,
} from "./local-mcp";
import { resolveBardoRoot } from "./workspace-schema";

type Writer = {
	write(chunk: string): void;
};

type CliDeps = {
	cwd?: string;
	stdout?: Writer;
	stderr?: Writer;
	env?: Record<string, string | undefined>;
};

type ParsedCommand =
	| { command: "help" }
	| { command: "init"; workspaceRoot: string; rulebook: string | null }
	| { command: "validate"; workspaceRoot: string }
	| {
			command: "connect";
			workspaceRoot: string;
			client: string;
			configPath: string | null;
			serverName: string;
			dryRun: boolean;
	  }
	| { command: "clients-list" }
	| { command: "doctor"; workspaceRoot: string; client: string | null }
	| { command: "mcp-serve"; workspaceRoot: string };

function valueAfter(argv: string[], flag: string): string | null {
	const index = argv.indexOf(flag);
	if (index === -1) return null;
	const value = argv[index + 1];
	return typeof value === "string" && !value.startsWith("--") ? value : null;
}

function hasFlag(argv: string[], flag: string): boolean {
	return argv.includes(flag);
}

function resolveWorkspaceRoot(argv: string[], cwd: string): string {
	return path.resolve(valueAfter(argv, "--workspace-root") ?? cwd);
}

function parseCommand(argv: string[], cwd: string): ParsedCommand {
	const [first, second] = argv;
	if (!first || first === "--help" || first === "-h" || first === "help") {
		return { command: "help" };
	}
	if (first === "mcp" && second === "serve") {
		return {
			command: "mcp-serve",
			workspaceRoot: resolveWorkspaceRoot(argv.slice(2), cwd),
		};
	}
	if (first === "serve") {
		return {
			command: "mcp-serve",
			workspaceRoot: resolveWorkspaceRoot(argv.slice(1), cwd),
		};
	}
	if (first === "init") {
		return {
			command: "init",
			workspaceRoot: resolveWorkspaceRoot(argv.slice(1), cwd),
			rulebook: valueAfter(argv, "--rulebook"),
		};
	}
	if (first === "validate") {
		return {
			command: "validate",
			workspaceRoot: resolveWorkspaceRoot(argv.slice(1), cwd),
		};
	}
	if (first === "connect" || first === "install") {
		return {
			command: "connect",
			workspaceRoot: resolveWorkspaceRoot(argv.slice(1), cwd),
			client: valueAfter(argv, "--client") ?? "auto",
			configPath: valueAfter(argv, "--config-path"),
			serverName: valueAfter(argv, "--server-name") ?? "bardo",
			dryRun: hasFlag(argv, "--dry-run"),
		};
	}
	if (first === "clients" && second === "list") {
		return { command: "clients-list" };
	}
	if (first === "doctor") {
		return {
			command: "doctor",
			workspaceRoot: resolveWorkspaceRoot(argv.slice(1), cwd),
			client: valueAfter(argv, "--client"),
		};
	}
	return { command: "help" };
}

async function exists(targetPath: string): Promise<boolean> {
	return stat(targetPath)
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

async function handleInit(
	command: Extract<ParsedCommand, { command: "init" }>,
	stdout: Writer,
) {
	const bardoRoot = resolveBardoRoot(command.workspaceRoot);
	await mkdir(bardoRoot, { recursive: true });
	const importedRulebooks = await maybeImportRulebook({
		workspaceRoot: command.workspaceRoot,
		bardoRoot,
		rulebookPath: command.rulebook,
	});
	const nowIso = new Date().toISOString();
	await ensureWorkspaceCoreFiles({
		workspaceRoot: command.workspaceRoot,
		bardoRoot,
		ruleset: null,
		nowIso,
		importedRulebooks,
	});
	const readinessPath = path.join(bardoRoot, "manifests/readiness.json");
	const readiness = JSON.parse(await readFile(readinessPath, "utf8")) as {
		status: string;
		gaps: string[];
	};
	stdout.write(`Initialized Bardo workspace at ${bardoRoot}\n`);
	stdout.write(`Readiness: ${readiness.status}\n`);
	if (readiness.gaps.length > 0) {
		stdout.write(
			`Gaps:\n${readiness.gaps.map((gap) => `- ${gap}`).join("\n")}\n`,
		);
	}
	return 0;
}

async function handleValidate(
	command: Extract<ParsedCommand, { command: "validate" }>,
	stdout: Writer,
) {
	const bardoRoot = resolveBardoRoot(command.workspaceRoot);
	const readinessPath = path.join(bardoRoot, "manifests/readiness.json");
	if (!(await exists(readinessPath))) {
		stdout.write(
			"Bardo workspace is not initialized. Run `bardo init` first.\n",
		);
		return 1;
	}
	const readiness = JSON.parse(await readFile(readinessPath, "utf8")) as {
		status?: string;
		gaps?: string[];
	};
	stdout.write(`Readiness: ${readiness.status ?? "unknown"}\n`);
	for (const gap of readiness.gaps ?? []) {
		stdout.write(`- ${gap}\n`);
	}
	return readiness.status === "needs-user-input" ? 1 : 0;
}

async function handleConnect(
	command: Extract<ParsedCommand, { command: "connect" }>,
	stdout: Writer,
) {
	const selection = await resolveAutoInstallClientSelection({
		client: command.client,
		workspaceRoot: command.workspaceRoot,
	});
	const client = selection.client as AutoInstallConnectionClient;
	const configPath = command.configPath
		? path.resolve(command.workspaceRoot, command.configPath)
		: selection.configPath;
	const existingContent = await readFile(configPath, "utf8").catch(() => "");
	const nextContent = buildInstallConfigContent({
		client,
		mode: "local",
		serverName: command.serverName,
		url: "local",
		existingContent,
	});
	if (command.dryRun) {
		stdout.write(nextContent);
		return 0;
	}
	await mkdir(path.dirname(configPath), { recursive: true });
	await writeFile(configPath, nextContent, "utf8");
	stdout.write(`Configured ${client} for local Bardo MCP at ${configPath}\n`);
	return 0;
}

async function handleDoctor(
	command: Extract<ParsedCommand, { command: "doctor" }>,
	stdout: Writer,
) {
	const bardoRoot = resolveBardoRoot(command.workspaceRoot);
	const initialized = await exists(bardoRoot);
	stdout.write(`Workspace: ${command.workspaceRoot}\n`);
	stdout.write(`.bardo initialized: ${initialized ? "yes" : "no"}\n`);
	if (command.client) {
		stdout.write(`Client check requested: ${command.client}\n`);
	}
	stdout.write("Local MCP transport: stdio\n");
	stdout.write("Account required for local use: no\n");
	return initialized ? 0 : 1;
}

function writeHelp(stdout: Writer) {
	stdout.write(`Bardo local-first tabletop runtime

Usage:
  bardo init [--workspace-root <path>] [--rulebook <path>]
  bardo validate [--workspace-root <path>]
  bardo connect --client <codex|claude|opencode|gemini|cursor|auto> [--workspace-root <path>]
  bardo doctor [--workspace-root <path>]
  bardo clients list
  bardo mcp serve [--workspace-root <path>]

Common first run:
  bardo init --rulebook ./RULEBOOK.md
  bardo validate
  bardo connect --client opencode

Notes:
  validate exits nonzero until required campaign inputs are present.
  add a small campaign notes file when location or active quest is missing.

Local workspace usage is free and open. Paid Bardo Pro features are limited to cloud campaign storage and hosted app integrations.
`);
}

export async function runCli(
	argv: string[],
	deps: CliDeps = {},
): Promise<number> {
	const stdout = deps.stdout ?? process.stdout;
	const stderr = deps.stderr ?? process.stderr;
	const cwd = deps.cwd ?? process.cwd();
	const command = parseCommand(argv, cwd);
	try {
		switch (command.command) {
			case "help":
				writeHelp(stdout);
				return 0;
			case "init":
				return await handleInit(command, stdout);
			case "validate":
				return await handleValidate(command, stdout);
			case "connect":
				return await handleConnect(command, stdout);
			case "clients-list":
				for (const client of listConnectionClientAdapters()) {
					stdout.write(
						`${client.id}\t${client.label}\t${client.autoInstall ? "auto" : "manual"}\n`,
					);
				}
				return 0;
			case "doctor":
				return await handleDoctor(command, stdout);
			case "mcp-serve":
				await startLocalMcpServer({
					workspaceRoot: command.workspaceRoot,
					apiKey: null,
					url: "local",
					plan: null,
					env: deps.env,
					stderr,
				});
				return 0;
		}
	} catch (error) {
		stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
}
