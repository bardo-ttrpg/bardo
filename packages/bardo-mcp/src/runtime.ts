import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	type AutoInstallConnectionClient,
	buildInstallConfigContent,
	type ConnectionClient,
	type ConnectionMode,
	getConnectionClientAdapter,
	getConnectionClientDisplayName,
	listConnectionClientAdapters,
	listTomlTableBlocks,
} from "./client-adapters";
import {
	resolveAutoInstallClientSelection,
	resolveDoctorClientSelection,
} from "./client-resolution";
import { writeTextAtomic } from "./file-utils";
import { ensureWorkspaceLocalDocs } from "./local-docs";
import {
	maybeImportRulebook as importWorkspaceRulebook,
	startLocalMcpServer,
} from "./local-mcp";
import { normalizePlan, type PlanTier } from "./plan-utils";
import { migrateSavedConfig, type SavedConfig } from "./saved-config";
import { resolveBardoRoot, WORKSPACE_DIRECTORIES } from "./workspace-schema";

const DEFAULT_MCP_URL = "http://127.0.0.1:3000/mcp";
const DEFAULT_LOGIN_START_URL =
	"https://app.bardo.ai/api/connect/cli-session/start";
const CONFIG_FILE_NAME = "config.json";

type Writer = {
	write(chunk: string): void;
};

type FetchLike = typeof fetch;

type LoginCommandOptions = {
	apiKey: string | null;
	url: string | null;
	token: string | null;
	exchangeUrl: string | null;
	statusUrl: string | null;
	startUrl: string | null;
};

type WorkspaceCommandOptions = {
	workspaceRoot: string | null;
};

type InitCommandOptions = WorkspaceCommandOptions & {
	rulebookPath: string | null;
	ruleset: string | null;
};

type InstallCommandOptions = WorkspaceCommandOptions & {
	client: string | null;
	mode: string | null;
	configPath: string | null;
	serverName: string | null;
	dryRun: boolean;
};

type ConnectCommandOptions = WorkspaceCommandOptions & {
	client: string | null;
	mode: string | null;
	configPath: string | null;
	serverName: string | null;
	dryRun: boolean;
	apiKey: string | null;
	url: string | null;
	token: string | null;
	exchangeUrl: string | null;
	statusUrl: string | null;
	startUrl: string | null;
	rulebookPath: string | null;
	ruleset: string | null;
	skipInit: boolean;
};

type ExportCommandOptions = WorkspaceCommandOptions & {
	outputPath: string | null;
};

type PackDebugCommandOptions = WorkspaceCommandOptions & {
	outputPath: string | null;
};

type DoctorCommandOptions = WorkspaceCommandOptions & {
	client: string | null;
	json: boolean;
};

type ClientsListCommandOptions = {
	json: boolean;
};

export type ServeCommandOptions = WorkspaceCommandOptions & {
	apiKey: string | null;
	url: string | null;
};

type ParsedCliCommand =
	| { command: "help" }
	| { command: "clients-list"; options: ClientsListCommandOptions }
	| { command: "login"; options: LoginCommandOptions }
	| { command: "logout" }
	| { command: "init"; options: InitCommandOptions }
	| { command: "install"; options: InstallCommandOptions }
	| { command: "connect"; options: ConnectCommandOptions }
	| { command: "export"; options: ExportCommandOptions }
	| { command: "pack-debug"; options: PackDebugCommandOptions }
	| { command: "doctor"; options: DoctorCommandOptions }
	| { command: "mcp-serve"; options: ServeCommandOptions };

export type CliRuntimeDeps = {
	cwd?: string;
	env?: Record<string, string | undefined>;
	homeDir?: string;
	stdout?: Writer;
	stderr?: Writer;
	fetch?: FetchLike;
	startBridge?: (options: ResolvedServeOptions) => Promise<void>;
	now?: () => Date;
	sleep?: (ms: number) => Promise<void>;
};

type ResolvedServeOptions = {
	apiKey: string;
	url: string;
	workspaceRoot: string;
	plan: PlanTier | null;
};

type BardoServerDetection = {
	hasBardoServer: boolean;
	urlMatches: boolean | null;
	actualUrl: string | null;
};

type DoctorOutput = {
	auth: {
		configured: boolean;
		source: "env" | "config" | "none";
		url: string | null;
		statusUrl: string | null;
	};
	workspace: {
		workspaceRoot: string;
		bardoRoot: string;
		initialized: boolean;
		manifestPath: string;
	};
	connectivity: {
		health: {
			url: string | null;
			ok: boolean;
			status: number | null;
			error: string | null;
		};
		controlPlane: {
			url: string | null;
			reachable: boolean;
			status: number | null;
			error: string | null;
		};
	};
	account: {
		fetched: boolean;
		ok: boolean;
		statusUrl: string | null;
		keyId: string | null;
		subjectId: string | null;
		scopes: string[];
		workspacePath: string | null;
		plan: string | null;
		mcpPeriodLimit: number | null;
		billingUnavailable: boolean;
		error: string | null;
	};
	client: {
		id: ConnectionClient;
		label: string;
		tier: string;
		autoInstall: boolean;
		supportsLocal: boolean;
		supportsRemote: boolean;
		defaultConfigPath: string | null;
		configPath: string | null;
		configExists: boolean;
		configValid: boolean;
		hasBardoServer: boolean;
		error: string | null;
		warning: string | null;
	} | null;
};

function deriveRuntimeStatusUrlFromControlPlaneUrl(
	value: string | null | undefined,
): string | null {
	const trimmed = value?.trim();
	if (!trimmed) {
		return null;
	}

	try {
		return new URL("/api/connect/runtime-status", trimmed).toString();
	} catch {
		return null;
	}
}

function resolveRuntimeStatusUrl(args: {
	explicitStatusUrl: string | null | undefined;
	controlPlaneUrls: Array<string | null | undefined>;
}): string | null {
	const explicit = args.explicitStatusUrl?.trim();
	if (explicit) {
		return explicit;
	}

	for (const candidate of args.controlPlaneUrls) {
		const derived = deriveRuntimeStatusUrlFromControlPlaneUrl(candidate);
		if (derived) {
			return derived;
		}
	}

	return null;
}

export function parseCliArgs(argv: string[]): ParsedCliCommand {
	if (argv.length === 0) {
		return { command: "help" };
	}

	const first = argv[0];
	if (!first) {
		return { command: "help" };
	}

	if (first === "--help" || first === "-h" || first === "help") {
		return { command: "help" };
	}

	if (first === "login") {
		return {
			command: "login",
			options: parseLoginOptions(argv.slice(1)),
		};
	}

	if (first === "logout") {
		return { command: "logout" };
	}

	if (first === "init") {
		return {
			command: "init",
			options: parseInitOptions(argv.slice(1)),
		};
	}

	if (first === "install") {
		return {
			command: "install",
			options: parseInstallOptions(argv.slice(1)),
		};
	}

	if (first === "connect") {
		return {
			command: "connect",
			options: parseConnectOptions(argv.slice(1)),
		};
	}

	if (first === "export") {
		return {
			command: "export",
			options: parseExportOptions(argv.slice(1)),
		};
	}

	if (first === "pack-debug") {
		return {
			command: "pack-debug",
			options: parsePackDebugOptions(argv.slice(1)),
		};
	}

	if (first === "doctor") {
		return {
			command: "doctor",
			options: parseDoctorOptions(argv.slice(1)),
		};
	}

	if (first === "clients") {
		const subcommand = argv[1];
		if (!subcommand || subcommand === "list") {
			return {
				command: "clients-list",
				options: parseClientsListOptions(
					subcommand === "list" ? argv.slice(2) : argv.slice(1),
				),
			};
		}
	}

	if (first === "mcp" && argv[1] === "serve") {
		return {
			command: "mcp-serve",
			options: parseServeOptions(argv.slice(2)),
		};
	}

	if (first === "serve" || first.startsWith("-")) {
		return {
			command: "mcp-serve",
			options: parseServeOptions(first === "serve" ? argv.slice(1) : argv),
		};
	}

	return { command: "help" };
}

function parseLoginOptions(argv: string[]): LoginCommandOptions {
	let apiKey: string | null = null;
	let url: string | null = null;
	let token: string | null = null;
	let exchangeUrl: string | null = null;
	let statusUrl: string | null = null;
	let startUrl: string | null = null;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (
			(arg === "--api-key" || arg === "-k") &&
			typeof argv[index + 1] === "string"
		) {
			apiKey = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (
			(arg === "--url" || arg === "-u") &&
			typeof argv[index + 1] === "string"
		) {
			url = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--token" && typeof argv[index + 1] === "string") {
			token = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--exchange-url" && typeof argv[index + 1] === "string") {
			exchangeUrl = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--status-url" && typeof argv[index + 1] === "string") {
			statusUrl = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--start-url" && typeof argv[index + 1] === "string") {
			startUrl = argv[index + 1] ?? null;
			index += 1;
		}
	}

	return { apiKey, url, token, exchangeUrl, statusUrl, startUrl };
}

function parseWorkspaceRootOption(
	argv: string[],
	startIndex = 0,
): { workspaceRoot: string | null; nextIndex: number } {
	const arg = argv[startIndex];
	if (
		(arg === "--workspace-root" || arg === "-w") &&
		typeof argv[startIndex + 1] === "string"
	) {
		return {
			workspaceRoot: argv[startIndex + 1] ?? null,
			nextIndex: startIndex + 1,
		};
	}
	return { workspaceRoot: null, nextIndex: startIndex };
}

function parseInitOptions(argv: string[]): InitCommandOptions {
	let workspaceRoot: string | null = null;
	let rulebookPath: string | null = null;
	let ruleset: string | null = null;

	for (let index = 0; index < argv.length; index += 1) {
		const workspace = parseWorkspaceRootOption(argv, index);
		if (workspace.workspaceRoot) {
			workspaceRoot = workspace.workspaceRoot;
			index = workspace.nextIndex;
			continue;
		}

		const arg = argv[index];
		if (
			(arg === "--rulebook" || arg === "-r") &&
			typeof argv[index + 1] === "string"
		) {
			rulebookPath = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--ruleset" && typeof argv[index + 1] === "string") {
			ruleset = argv[index + 1] ?? null;
			index += 1;
		}
	}

	return { workspaceRoot, rulebookPath, ruleset };
}

function parseDoctorOptions(argv: string[]): DoctorCommandOptions {
	let workspaceRoot: string | null = null;
	let client: string | null = null;
	let json = false;

	for (let index = 0; index < argv.length; index += 1) {
		const workspace = parseWorkspaceRootOption(argv, index);
		if (workspace.workspaceRoot) {
			workspaceRoot = workspace.workspaceRoot;
			index = workspace.nextIndex;
			continue;
		}

		if (argv[index] === "--client" && typeof argv[index + 1] === "string") {
			client = argv[index + 1] ?? null;
			index += 1;
			continue;
		}

		if (argv[index] === "--json") {
			json = true;
		}
	}

	return { workspaceRoot, client, json };
}

function parseClientsListOptions(argv: string[]): ClientsListCommandOptions {
	let json = false;

	for (const arg of argv) {
		if (arg === "--json") {
			json = true;
		}
	}

	return { json };
}

function parseInstallOptions(argv: string[]): InstallCommandOptions {
	let workspaceRoot: string | null = null;
	let client: string | null = null;
	let mode: string | null = null;
	let configPath: string | null = null;
	let serverName: string | null = null;
	let dryRun = false;

	for (let index = 0; index < argv.length; index += 1) {
		const workspace = parseWorkspaceRootOption(argv, index);
		if (workspace.workspaceRoot) {
			workspaceRoot = workspace.workspaceRoot;
			index = workspace.nextIndex;
			continue;
		}

		const arg = argv[index];
		if (arg === "--client" && typeof argv[index + 1] === "string") {
			client = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--mode" && typeof argv[index + 1] === "string") {
			mode = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--config-path" && typeof argv[index + 1] === "string") {
			configPath = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--server-name" && typeof argv[index + 1] === "string") {
			serverName = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--dry-run") {
			dryRun = true;
		}
	}

	return { workspaceRoot, client, mode, configPath, serverName, dryRun };
}

function parseConnectOptions(argv: string[]): ConnectCommandOptions {
	let workspaceRoot: string | null = null;
	let client: string | null = null;
	let mode: string | null = null;
	let configPath: string | null = null;
	let serverName: string | null = null;
	let dryRun = false;
	let apiKey: string | null = null;
	let url: string | null = null;
	let token: string | null = null;
	let exchangeUrl: string | null = null;
	let statusUrl: string | null = null;
	let startUrl: string | null = null;
	let rulebookPath: string | null = null;
	let ruleset: string | null = null;
	let skipInit = false;

	for (let index = 0; index < argv.length; index += 1) {
		const workspace = parseWorkspaceRootOption(argv, index);
		if (workspace.workspaceRoot) {
			workspaceRoot = workspace.workspaceRoot;
			index = workspace.nextIndex;
			continue;
		}

		const arg = argv[index];
		if (arg === "--client" && typeof argv[index + 1] === "string") {
			client = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--mode" && typeof argv[index + 1] === "string") {
			mode = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--config-path" && typeof argv[index + 1] === "string") {
			configPath = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--server-name" && typeof argv[index + 1] === "string") {
			serverName = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (
			(arg === "--api-key" || arg === "-k") &&
			typeof argv[index + 1] === "string"
		) {
			apiKey = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (
			(arg === "--url" || arg === "-u") &&
			typeof argv[index + 1] === "string"
		) {
			url = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--token" && typeof argv[index + 1] === "string") {
			token = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--exchange-url" && typeof argv[index + 1] === "string") {
			exchangeUrl = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--status-url" && typeof argv[index + 1] === "string") {
			statusUrl = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--start-url" && typeof argv[index + 1] === "string") {
			startUrl = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (
			(arg === "--rulebook" || arg === "-r") &&
			typeof argv[index + 1] === "string"
		) {
			rulebookPath = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--ruleset" && typeof argv[index + 1] === "string") {
			ruleset = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (arg === "--skip-init") {
			skipInit = true;
		}
	}

	return {
		workspaceRoot,
		client,
		mode,
		configPath,
		serverName,
		dryRun,
		apiKey,
		url,
		token,
		exchangeUrl,
		statusUrl,
		startUrl,
		rulebookPath,
		ruleset,
		skipInit,
	};
}

function parseExportOptions(argv: string[]): ExportCommandOptions {
	let workspaceRoot: string | null = null;
	let outputPath: string | null = null;

	for (let index = 0; index < argv.length; index += 1) {
		const workspace = parseWorkspaceRootOption(argv, index);
		if (workspace.workspaceRoot) {
			workspaceRoot = workspace.workspaceRoot;
			index = workspace.nextIndex;
			continue;
		}
		const arg = argv[index];
		if (
			(arg === "--output" || arg === "-o") &&
			typeof argv[index + 1] === "string"
		) {
			outputPath = argv[index + 1] ?? null;
			index += 1;
		}
	}

	return { workspaceRoot, outputPath };
}

function parsePackDebugOptions(argv: string[]): PackDebugCommandOptions {
	let workspaceRoot: string | null = null;
	let outputPath: string | null = null;

	for (let index = 0; index < argv.length; index += 1) {
		const workspace = parseWorkspaceRootOption(argv, index);
		if (workspace.workspaceRoot) {
			workspaceRoot = workspace.workspaceRoot;
			index = workspace.nextIndex;
			continue;
		}
		const arg = argv[index];
		if (
			(arg === "--output" || arg === "-o") &&
			typeof argv[index + 1] === "string"
		) {
			outputPath = argv[index + 1] ?? null;
			index += 1;
		}
	}

	return { workspaceRoot, outputPath };
}

function parseServeOptions(argv: string[]): ServeCommandOptions {
	let apiKey: string | null = null;
	let url: string | null = null;
	let workspaceRoot: string | null = null;

	for (let index = 0; index < argv.length; index += 1) {
		const workspace = parseWorkspaceRootOption(argv, index);
		if (workspace.workspaceRoot) {
			workspaceRoot = workspace.workspaceRoot;
			index = workspace.nextIndex;
			continue;
		}

		const arg = argv[index];
		if (
			(arg === "--api-key" || arg === "-k") &&
			typeof argv[index + 1] === "string"
		) {
			apiKey = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
		if (
			(arg === "--url" || arg === "-u") &&
			typeof argv[index + 1] === "string"
		) {
			url = argv[index + 1] ?? null;
			index += 1;
		}
	}

	return { apiKey, url, workspaceRoot };
}

export async function runCli(
	argv: string[],
	deps: CliRuntimeDeps = {},
): Promise<number> {
	const parsed = parseCliArgs(argv);
	const stdout = deps.stdout ?? process.stdout;
	const stderr = deps.stderr ?? process.stderr;

	switch (parsed.command) {
		case "help":
			stdout.write(renderHelp());
			return 0;
		case "clients-list":
			return handleClientsList(parsed.options, stdout);
		case "login":
			return handleLogin(parsed.options, deps, stdout, stderr);
		case "logout":
			return handleLogout(deps, stdout);
		case "init":
			return handleInit(parsed.options, deps, stdout, stderr);
		case "install":
			return handleInstall(parsed.options, deps, stdout, stderr);
		case "connect":
			return handleConnect(parsed.options, deps, stdout, stderr);
		case "export":
			return handleExport(parsed.options, deps, stdout, stderr);
		case "pack-debug":
			return handlePackDebug(parsed.options, deps, stdout, stderr);
		case "doctor":
			return handleDoctor(parsed.options, deps, stdout, stderr);
		case "mcp-serve":
			return handleServe(parsed.options, deps, stderr);
	}
}

function renderHelp(): string {
	return `Bardo runtime

Usage:
  bardo clients list [--json]
  bardo login --api-key <key> [--url <mcp-url>]
  bardo login --token <login-token> --exchange-url <https-url> [--status-url <https-url>]
  bardo login [--start-url <https-url>]
  bardo logout
  bardo init [--workspace-root <path>] [--rulebook <path>] [--ruleset <slug>]
  bardo install --client <claude|opencode|codex|cursor|windsurf|vscode|kiro|kilo|trae|auto> [--mode <local|remote>] [--config-path <path>] [--dry-run]
  bardo connect --client <claude|opencode|codex|cursor|windsurf|vscode|kiro|kilo|trae|auto> [--mode <local|remote>] [--ruleset <slug>] [--rulebook <path>]
  bardo export --output <path> [--workspace-root <path>]
  bardo pack-debug --output <path> [--workspace-root <path>]
  bardo doctor [--workspace-root <path>] [--client <client|auto>] [--json]
  bardo mcp serve [--api-key <key>] [--url <mcp-url>] [--workspace-root <path>]

Compatibility:
  bardo-mcp --api-key <key> [--url <mcp-url>] [--workspace-root <path>]

Notes:
  clients list shows the supported client matrix and whether each client can be auto-installed.
  For the simplest setup, run bardo connect --client <client> from your project root.
  login accepts either an API key directly or a short-lived website-issued login token.
  Without arguments, login can start a browser approval flow against the website control plane.
  connect logs in if needed, bootstraps the local workspace if missing, and installs the selected client config.
  --status-url lets doctor fetch plan and key status details from the website control plane.
  If you are testing from the source tree, run commands as: bun run --cwd packages/bardo-mcp start -- <command>.
  The workspace root defaults to the current working directory.
`;
}

async function handleLogin(
	options: LoginCommandOptions,
	deps: CliRuntimeDeps,
	stdout: Writer,
	stderr: Writer,
): Promise<number> {
	try {
		const env = deps.env ?? process.env;
		let apiKey = options.apiKey?.trim() || env.BARDO_API_KEY?.trim() || null;
		let url =
			options.url?.trim() || env.BARDO_MCP_URL?.trim() || DEFAULT_MCP_URL;
		let serverName: string | undefined;
		const startUrl =
			options.startUrl?.trim() ||
			env.BARDO_LOGIN_START_URL?.trim() ||
			DEFAULT_LOGIN_START_URL;
		let statusUrl = resolveRuntimeStatusUrl({
			explicitStatusUrl:
				options.statusUrl?.trim() ||
				env.BARDO_RUNTIME_STATUS_URL?.trim() ||
				null,
			controlPlaneUrls: [
				startUrl,
				options.exchangeUrl?.trim() ||
					env.BARDO_LOGIN_EXCHANGE_URL?.trim() ||
					null,
			],
		});

		if (!apiKey && options.token?.trim()) {
			const exchange = await exchangeLoginToken({
				token: options.token.trim(),
				exchangeUrl:
					options.exchangeUrl?.trim() ||
					env.BARDO_LOGIN_EXCHANGE_URL?.trim() ||
					null,
				fetchImpl: deps.fetch ?? fetch,
			});
			apiKey = exchange.apiKey;
			url = exchange.mcpUrl;
			serverName = exchange.serverName;
			statusUrl = exchange.statusUrl ?? statusUrl;
		}

		if (!apiKey && !options.token?.trim()) {
			const interactive = await runInteractiveLoginFlow({
				startUrl,
				fetchImpl: deps.fetch ?? fetch,
				sleep:
					deps.sleep ??
					(async (ms) => new Promise((resolve) => setTimeout(resolve, ms))),
				stdout,
			});
			apiKey = interactive.apiKey;
			url = interactive.mcpUrl;
			statusUrl = interactive.statusUrl ?? statusUrl;
			serverName = interactive.serverName;
		}

		if (!apiKey) {
			stderr.write(
				"Missing API key. Pass --api-key, set BARDO_API_KEY, or use --token with --exchange-url.\n",
			);
			return 1;
		}

		const now = (deps.now ?? (() => new Date()))().toISOString();
		await writeConfig(resolveConfigPath(deps), {
			version: 1,
			apiKey,
			url,
			updatedAtISO: now,
			serverName,
			statusUrl: statusUrl ?? undefined,
		});
		stdout.write(`Saved Bardo credentials to ${resolveConfigPath(deps)}\n`);
		return 0;
	} catch (error) {
		stderr.write(`${toErrorMessage(error)}\n`);
		return 1;
	}
}

function handleClientsList(
	options: ClientsListCommandOptions,
	stdout: Writer,
): number {
	const clients = listConnectionClientAdapters().map((client) => ({
		id: client.id,
		label: client.label,
		tier: client.tier,
		autoInstall: client.autoInstall,
		supportsLocal: client.supportsLocal,
		supportsRemote: client.supportsRemote,
		defaultConfigPath: client.defaultConfigPath,
	}));

	if (options.json) {
		stdout.write(`${JSON.stringify(clients, null, 2)}\n`);
		return 0;
	}

	const lines = ["Bardo supported clients", ""];
	for (const client of clients) {
		lines.push(
			`${client.label} (${client.id})`,
			`  tier: ${client.tier}`,
			`  auto-install: ${client.autoInstall ? "yes" : "no"}`,
			`  local: ${client.supportsLocal ? "yes" : "no"}`,
			`  remote: ${client.supportsRemote ? "yes" : "no"}`,
			`  config path: ${client.defaultConfigPath ?? "manual / client-specific"}`,
			"",
		);
	}

	stdout.write(`${lines.join("\n")}\n`);
	return 0;
}

async function handleLogout(
	deps: CliRuntimeDeps,
	stdout: Writer,
): Promise<number> {
	await rm(resolveConfigPath(deps), { force: true });
	stdout.write("Removed saved Bardo credentials.\n");
	return 0;
}

async function handleInit(
	options: InitCommandOptions,
	deps: CliRuntimeDeps,
	stdout: Writer,
	stderr: Writer,
): Promise<number> {
	try {
		const env = deps.env ?? process.env;
		const workspaceRoot = resolveWorkspaceRoot(
			options.workspaceRoot,
			deps.cwd ?? process.cwd(),
		);
		const bardoRoot = resolveBardoRoot(workspaceRoot, env);
		const createdDirectories = await ensureWorkspaceDirectories(bardoRoot);
		const importedRulebooks = await importWorkspaceRulebook({
			workspaceRoot,
			bardoRoot,
			rulebookPath: options.rulebookPath,
		});
		const now = (deps.now ?? (() => new Date()))().toISOString();
		await ensureWorkspaceCoreFiles({
			bardoRoot,
			workspaceRoot,
			ruleset: options.ruleset,
			importedRulebooks,
			nowIso: now,
		});
		stdout.write(
			`Initialized Bardo workspace at ${bardoRoot} (${createdDirectories.length} directories ensured)\n`,
		);
		return 0;
	} catch (error) {
		stderr.write(`${toErrorMessage(error)}\n`);
		return 1;
	}
}

async function handleInstall(
	options: InstallCommandOptions,
	deps: CliRuntimeDeps,
	stdout: Writer,
	stderr: Writer,
): Promise<number> {
	try {
		const env = deps.env ?? process.env;
		const config = await readConfig(resolveConfigPath(deps));
		const workspaceRoot = resolveWorkspaceRoot(
			options.workspaceRoot || env.BARDO_WORKSPACE_ROOT || null,
			deps.cwd ?? process.cwd(),
		);
		const selection = await resolveAutoInstallClientSelection({
			client: options.client,
			workspaceRoot,
		});
		const client = selection.client;
		if (options.mode?.trim().toLowerCase() === "remote") {
			stderr.write(
				"Remote mode is deprecated and temporarily shimmed to local stdio mode.\n",
			);
		}
		const mode = normalizeInstallMode(options.mode);
		const credentials = resolveStoredCredentials(config, env);
		if (!credentials.apiKey || !credentials.url) {
			throw new Error("Missing saved credentials. Run `bardo login` first.");
		}

		const serverName =
			options.serverName?.trim() || config?.serverName || "bardo";
		const configPath = resolveInstallConfigPath({
			client,
			workspaceRoot,
			configPath: options.configPath,
		});
		const existingContent = await readFile(configPath, "utf8").catch(() => "");
		const nextContent = buildInstallConfigContent({
			client,
			mode,
			serverName,
			apiKey: credentials.apiKey,
			url: credentials.url,
			existingContent,
		});

		if (options.dryRun) {
			stdout.write(`${nextContent}\n`);
			return 0;
		}

		await writeTextAtomic(configPath, nextContent);
		stdout.write(`Installed Bardo MCP config at ${configPath}\n`);
		return 0;
	} catch (error) {
		stderr.write(`${toErrorMessage(error)}\n`);
		return 1;
	}
}

async function handleConnect(
	options: ConnectCommandOptions,
	deps: CliRuntimeDeps,
	stdout: Writer,
	stderr: Writer,
): Promise<number> {
	try {
		const env = deps.env ?? process.env;
		const workspaceRoot = resolveWorkspaceRoot(
			options.workspaceRoot || env.BARDO_WORKSPACE_ROOT || null,
			deps.cwd ?? process.cwd(),
		);
		const selection = await resolveAutoInstallClientSelection({
			client: options.client,
			workspaceRoot,
		});
		const client = selection.client;
		const config = await readConfig(resolveConfigPath(deps));
		const credentials = resolveConnectCredentials(options, config, env);
		if (options.dryRun) {
			if (options.mode?.trim().toLowerCase() === "remote") {
				stderr.write(
					"Remote mode is deprecated and temporarily shimmed to local stdio mode.\n",
				);
			}
			if (!credentials.apiKey || !credentials.url) {
				throw new Error(
					"Missing credentials for dry-run. Pass --api-key with --url or run `bardo login` first.",
				);
			}

			const serverName =
				options.serverName?.trim() || config?.serverName || "bardo";
			const configPath = resolveInstallConfigPath({
				client,
				workspaceRoot,
				configPath: options.configPath,
			});
			const existingContent = await readFile(configPath, "utf8").catch(
				() => "",
			);
			const nextContent = buildInstallConfigContent({
				client,
				mode: normalizeInstallMode(options.mode),
				serverName,
				apiKey: credentials.apiKey,
				url: credentials.url,
				existingContent,
			});
			stdout.write(`${nextContent}\n`);
			return 0;
		}

		const hasLoginInputs = [options.token, options.apiKey].some(
			(value) => typeof value === "string" && value.trim().length > 0,
		);
		const hasMetadataOverrides = [
			options.url,
			options.statusUrl,
			options.serverName,
		].some((value) => typeof value === "string" && value.trim().length > 0);

		if (hasLoginInputs || !credentials.apiKey || !credentials.url) {
			const loginExitCode = await handleLogin(
				{
					apiKey: options.apiKey,
					url: options.url,
					token: options.token,
					exchangeUrl: options.exchangeUrl,
					statusUrl: options.statusUrl,
					startUrl: options.startUrl,
				},
				deps,
				stdout,
				stderr,
			);
			if (loginExitCode !== 0) {
				return loginExitCode;
			}
		} else if (hasMetadataOverrides) {
			await writeConfig(resolveConfigPath(deps), {
				version: 1,
				apiKey: credentials.apiKey,
				url: credentials.url,
				statusUrl:
					options.statusUrl?.trim() ||
					config?.statusUrl ||
					env.BARDO_RUNTIME_STATUS_URL?.trim() ||
					undefined,
				serverName: options.serverName?.trim() || config?.serverName,
				updatedAtISO: (deps.now ?? (() => new Date()))().toISOString(),
			});
		}

		if (!options.skipInit) {
			const bardoRoot = resolveBardoRoot(workspaceRoot, env);
			const manifestExists = await access(path.join(bardoRoot, "manifest.json"))
				.then(() => true)
				.catch(() => false);
			if (
				!manifestExists ||
				Boolean(options.rulebookPath?.trim()) ||
				Boolean(options.ruleset?.trim())
			) {
				const initExitCode = await handleInit(
					{
						workspaceRoot,
						rulebookPath: options.rulebookPath,
						ruleset: options.ruleset,
					},
					deps,
					stdout,
					stderr,
				);
				if (initExitCode !== 0) {
					return initExitCode;
				}
			}
		}

		const installExitCode = await handleInstall(
			{
				workspaceRoot,
				client,
				mode: options.mode,
				configPath: options.configPath,
				serverName: options.serverName,
				dryRun: options.dryRun,
			},
			deps,
			stdout,
			stderr,
		);
		if (installExitCode !== 0) {
			return installExitCode;
		}

		stdout.write(
			`Connected Bardo to ${getConnectionClientDisplayName(client)} for ${workspaceRoot}\n`,
		);
		return 0;
	} catch (error) {
		stderr.write(`${toErrorMessage(error)}\n`);
		return 1;
	}
}

async function handleExport(
	options: ExportCommandOptions,
	deps: CliRuntimeDeps,
	stdout: Writer,
	stderr: Writer,
): Promise<number> {
	try {
		const env = deps.env ?? process.env;
		const workspaceRoot = resolveWorkspaceRoot(
			options.workspaceRoot || env.BARDO_WORKSPACE_ROOT || null,
			deps.cwd ?? process.cwd(),
		);
		const bardoRoot = resolveBardoRoot(workspaceRoot, env);
		const outputPath = options.outputPath?.trim();
		if (!outputPath) {
			throw new Error("Missing output path. Pass --output <path>.");
		}

		const resolvedOutputRoot = path.resolve(outputPath);
		const targetPath = path.join(resolvedOutputRoot, path.basename(bardoRoot));
		await mkdir(resolvedOutputRoot, { recursive: true });
		await rm(targetPath, { recursive: true, force: true });
		await cp(bardoRoot, targetPath, { recursive: true });
		stdout.write(`Exported Bardo workspace to ${targetPath}\n`);
		return 0;
	} catch (error) {
		stderr.write(`${toErrorMessage(error)}\n`);
		return 1;
	}
}

async function handlePackDebug(
	options: PackDebugCommandOptions,
	deps: CliRuntimeDeps,
	stdout: Writer,
	stderr: Writer,
): Promise<number> {
	try {
		const env = deps.env ?? process.env;
		const outputPath = options.outputPath?.trim();
		if (!outputPath) {
			throw new Error("Missing output path. Pass --output <path>.");
		}

		const config = await readConfig(resolveConfigPath(deps));
		const doctor = await buildDoctorReport(
			{
				workspaceRoot: options.workspaceRoot,
				json: true,
			},
			deps,
		);
		const workspaceRoot = resolveWorkspaceRoot(
			options.workspaceRoot || env.BARDO_WORKSPACE_ROOT || null,
			deps.cwd ?? process.cwd(),
		);
		const bardoRoot = resolveBardoRoot(workspaceRoot, env);
		const manifest = await readExistingJson(
			path.join(bardoRoot, "manifest.json"),
		);

		const payload = {
			generatedAtISO: (deps.now ?? (() => new Date()))().toISOString(),
			config: {
				apiKeyRedacted: Boolean(config?.apiKey),
				apiKeyPreview: redactApiKey(config?.apiKey ?? null),
				url: config?.url ?? null,
				statusUrl: config?.statusUrl ?? null,
				serverName: config?.serverName ?? null,
				updatedAtISO: config?.updatedAtISO ?? null,
			},
			doctor,
			manifest,
		};

		const resolvedOutputPath = path.resolve(outputPath);
		await writeTextAtomic(resolvedOutputPath, JSON.stringify(payload, null, 2));
		stdout.write(`Wrote Bardo debug bundle to ${resolvedOutputPath}\n`);
		return 0;
	} catch (error) {
		stderr.write(`${toErrorMessage(error)}\n`);
		return 1;
	}
}

async function handleDoctor(
	options: DoctorCommandOptions,
	deps: CliRuntimeDeps,
	stdout: Writer,
	stderr: Writer,
): Promise<number> {
	try {
		const report = await buildDoctorReport(options, deps);
		if (options.json) {
			stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		} else {
			stdout.write(renderDoctorReport(report));
		}

		const clientHealthy =
			report.client === null ||
			!report.client.autoInstall ||
			(report.client.configExists &&
				report.client.configValid &&
				report.client.hasBardoServer);
		return report.auth.configured &&
			report.connectivity.health.ok &&
			clientHealthy
			? 0
			: 1;
	} catch (error) {
		stderr.write(`${toErrorMessage(error)}\n`);
		return 1;
	}
}

async function handleServe(
	options: ServeCommandOptions,
	deps: CliRuntimeDeps,
	stderr: Writer,
): Promise<number> {
	const env = deps.env ?? process.env;
	const config = await readConfig(resolveConfigPath(deps));
	const statusUrl =
		resolveRuntimeStatusUrl({
			explicitStatusUrl: env.BARDO_RUNTIME_STATUS_URL?.trim() || null,
			controlPlaneUrls: [
				env.BARDO_LOGIN_START_URL?.trim() || null,
				env.BARDO_LOGIN_EXCHANGE_URL?.trim() || null,
				DEFAULT_LOGIN_START_URL,
			],
		}) ||
		resolveRuntimeStatusUrl({
			explicitStatusUrl: config?.statusUrl?.trim() || null,
			controlPlaneUrls: [DEFAULT_LOGIN_START_URL],
		});
	const resolved = {
		apiKey:
			options.apiKey?.trim() ||
			env.BARDO_API_KEY?.trim() ||
			config?.apiKey?.trim() ||
			"",
		url:
			options.url?.trim() ||
			env.BARDO_MCP_URL?.trim() ||
			config?.url?.trim() ||
			DEFAULT_MCP_URL,
		workspaceRoot: resolveWorkspaceRoot(
			options.workspaceRoot || env.BARDO_WORKSPACE_ROOT || null,
			deps.cwd ?? process.cwd(),
		),
		plan: await resolveServePlan({
			apiKey:
				options.apiKey?.trim() ||
				env.BARDO_API_KEY?.trim() ||
				config?.apiKey?.trim() ||
				"",
			statusUrl,
			env,
			fetchImpl: deps.fetch ?? fetch,
			stderr,
		}),
	};

	try {
		const startBridge =
			deps.startBridge ??
			(async (bridgeOptions: ResolvedServeOptions) =>
				startLocalMcpServer({
					apiKey: bridgeOptions.apiKey || null,
					url: bridgeOptions.url,
					workspaceRoot: bridgeOptions.workspaceRoot,
					plan: bridgeOptions.plan,
					env,
					stderr,
				}));
		await startBridge(resolved);
		return 0;
	} catch (error) {
		stderr.write(`${toErrorMessage(error)}\n`);
		return 1;
	}
}

function resolveWorkspaceRoot(input: string | null, cwd: string): string {
	return path.resolve(input?.trim() || cwd);
}

function resolveRuntimeStatusTimeoutMs(
	env: Record<string, string | undefined>,
): number {
	const raw = Number(env.BARDO_RUNTIME_STATUS_TIMEOUT_MS ?? "1500");
	if (!Number.isFinite(raw) || raw < 100) {
		return 1500;
	}
	return Math.floor(raw);
}

async function resolveServePlan(args: {
	apiKey: string;
	statusUrl: string | null;
	env: Record<string, string | undefined>;
	fetchImpl: FetchLike;
	stderr: Writer;
}): Promise<PlanTier | null> {
	const envPlan = normalizePlan(args.env.BARDO_PLAN);
	if (envPlan) {
		return envPlan;
	}
	if (!args.apiKey || !args.statusUrl) {
		return null;
	}

	const timeoutMs = resolveRuntimeStatusTimeoutMs(args.env);
	const abortController = new AbortController();
	const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

	try {
		const response = await args.fetchImpl(args.statusUrl, {
			headers: {
				authorization: `Bearer ${args.apiKey}`,
			},
			signal: abortController.signal,
		});
		if (!response.ok) {
			args.stderr.write(
				`runtime status request failed with status ${response.status}; continuing without plan-aware filtering.\n`,
			);
			return null;
		}
		const payload = (await response.json()) as { plan?: unknown };
		return normalizePlan(payload.plan);
	} catch (error) {
		if (
			error instanceof Error &&
			(error.name === "AbortError" || abortController.signal.aborted)
		) {
			args.stderr.write(
				`runtime status request timed out after ${timeoutMs}ms; continuing without plan-aware filtering.\n`,
			);
			return null;
		}
		args.stderr.write(
			`runtime status request failed; continuing without plan-aware filtering: ${toErrorMessage(
				error,
			)}\n`,
		);
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}

async function ensureWorkspaceDirectories(
	bardoRoot: string,
): Promise<string[]> {
	const created: string[] = [];

	await mkdir(bardoRoot, { recursive: true });
	for (const relative of WORKSPACE_DIRECTORIES) {
		const target = path.join(bardoRoot, relative);
		try {
			await access(target);
		} catch {
			created.push(target);
		}
		await mkdir(target, { recursive: true });
	}

	return created;
}

async function ensureWorkspaceCoreFiles(args: {
	bardoRoot: string;
	workspaceRoot: string;
	ruleset: string | null;
	importedRulebooks: string[];
	nowIso: string;
}): Promise<void> {
	const manifestPath = path.join(args.bardoRoot, "manifest.json");
	const manifest = await readExistingJson(manifestPath);
	const nextManifest = {
		version: 1,
		createdAtISO:
			typeof manifest?.createdAtISO === "string"
				? manifest.createdAtISO
				: args.nowIso,
		updatedAtISO: args.nowIso,
		workspaceRoot: args.workspaceRoot,
		bardoRoot: args.bardoRoot,
		ruleset: args.ruleset ?? null,
		importedRulebooks:
			args.importedRulebooks.length > 0
				? args.importedRulebooks
				: Array.isArray(manifest?.importedRulebooks)
					? manifest.importedRulebooks
					: [],
	};

	await writeJsonFile(manifestPath, nextManifest);
	await ensureFile(
		path.join(args.bardoRoot, "_settings/settings.md"),
		renderJsonMarkdown(
			"Campaign Settings",
			"Campaign setup settings and preferences.",
			{ updatedAtISO: args.nowIso },
		),
	);
	await ensureFile(
		path.join(args.bardoRoot, "state/current.md"),
		renderJsonMarkdown(
			"Campaign State",
			"Current campaign state and memory snapshot.",
			{},
		),
	);
	await ensureFile(
		path.join(args.bardoRoot, "events/history.md"),
		renderMarkdown(
			"Campaign History",
			"Chronological campaign action history log.",
			"",
		),
	);
	await ensureWorkspaceLocalDocs({
		bardoRoot: args.bardoRoot,
		workspaceRoot: args.workspaceRoot,
	});
}

async function ensureFile(filePath: string, content: string): Promise<void> {
	try {
		await access(filePath);
	} catch {
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, content, "utf8");
	}
}

function renderMarkdown(
	title: string,
	description: string,
	body: string,
): string {
	return `---\ntitle: ${escapeYaml(title)}\ndescription: ${escapeYaml(
		description,
	)}\n---\n\n${body}`
		.trimEnd()
		.concat("\n");
}

function renderJsonMarkdown(
	title: string,
	description: string,
	payload: object,
): string {
	return renderMarkdown(title, description, JSON.stringify(payload, null, 2));
}

function escapeYaml(value: string): string {
	return JSON.stringify(value);
}

async function readExistingJson(
	filePath: string,
): Promise<Record<string, unknown> | null> {
	try {
		const raw = await readFile(filePath, "utf8");
		const parsed = JSON.parse(raw);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
		) {
			return parsed as Record<string, unknown>;
		}
		return null;
	} catch {
		return null;
	}
}

function resolveConfigPath(deps: CliRuntimeDeps): string {
	const env = deps.env ?? process.env;
	const homeDir = deps.homeDir ?? env.HOME ?? os.homedir();
	const configDir =
		env.BARDO_CONFIG_DIR?.trim() || path.join(homeDir, ".config/bardo");
	return path.join(configDir, CONFIG_FILE_NAME);
}

async function writeConfig(
	filePath: string,
	config: SavedConfig,
): Promise<void> {
	await writeTextAtomic(filePath, JSON.stringify(config, null, 2));
}

async function readConfig(filePath: string): Promise<SavedConfig | null> {
	try {
		const raw = await readFile(filePath, "utf8");
		return migrateSavedConfig(JSON.parse(raw));
	} catch {
		return null;
	}
}

function resolveStoredCredentials(
	config: SavedConfig | null,
	env: Record<string, string | undefined>,
) {
	return {
		apiKey: env.BARDO_API_KEY?.trim() || config?.apiKey || null,
		url: env.BARDO_MCP_URL?.trim() || config?.url || null,
	};
}

function resolveConnectCredentials(
	options: ConnectCommandOptions,
	config: SavedConfig | null,
	env: Record<string, string | undefined>,
) {
	return {
		apiKey:
			options.apiKey?.trim() ||
			env.BARDO_API_KEY?.trim() ||
			config?.apiKey ||
			null,
		url:
			options.url?.trim() || env.BARDO_MCP_URL?.trim() || config?.url || null,
	};
}

function normalizeInstallMode(value: string | null): ConnectionMode {
	const normalized = value?.trim().toLowerCase() || "local";
	if (normalized === "local") {
		return "local";
	}
	if (normalized === "remote") {
		return "local";
	}
	throw new Error("Unsupported mode. Use local or remote.");
}

function resolveInstallConfigPath(args: {
	client: AutoInstallConnectionClient;
	workspaceRoot: string;
	configPath: string | null;
}): string {
	if (args.configPath?.trim()) {
		return path.resolve(args.workspaceRoot, args.configPath.trim());
	}
	const adapter = getConnectionClientAdapter(args.client);
	if (!adapter.defaultConfigPath) {
		throw new Error(`Client ${adapter.label} does not support auto-install.`);
	}
	return path.join(args.workspaceRoot, adapter.defaultConfigPath);
}

function redactApiKey(apiKey: string | null): string | null {
	if (!apiKey) {
		return null;
	}
	if (apiKey.length <= 10) {
		return `${apiKey.slice(0, 2)}***${apiKey.slice(-2)}`;
	}
	return `${apiKey.slice(0, 10)}***${apiKey.slice(-4)}`;
}

async function exchangeLoginToken(args: {
	token: string;
	exchangeUrl: string | null;
	fetchImpl: FetchLike;
}): Promise<{
	apiKey: string;
	mcpUrl: string;
	statusUrl?: string;
	serverName?: string;
}> {
	if (!args.exchangeUrl) {
		throw new Error(
			"Missing exchange URL. Pass --exchange-url or set BARDO_LOGIN_EXCHANGE_URL.",
		);
	}

	let response: Response;
	try {
		response = await args.fetchImpl(args.exchangeUrl, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json",
			},
			body: JSON.stringify({ token: args.token }),
		});
	} catch (error) {
		throw new Error(formatControlPlaneRequestError(args.exchangeUrl, error));
	}
	const body = (await response.json().catch(() => ({}))) as {
		apiKey?: string;
		mcpUrl?: string;
		statusUrl?: string;
		serverName?: string;
		error?: string;
	};

	if (!response.ok) {
		throw new Error(
			body.error || `Token exchange failed with status ${response.status}.`,
		);
	}

	if (typeof body.apiKey !== "string" || typeof body.mcpUrl !== "string") {
		throw new Error("Token exchange returned an invalid payload.");
	}

	return {
		apiKey: body.apiKey,
		mcpUrl: body.mcpUrl,
		statusUrl: typeof body.statusUrl === "string" ? body.statusUrl : undefined,
		serverName:
			typeof body.serverName === "string" ? body.serverName : undefined,
	};
}

async function runInteractiveLoginFlow(args: {
	startUrl: string;
	fetchImpl: FetchLike;
	sleep: (ms: number) => Promise<void>;
	stdout: Writer;
}): Promise<{
	apiKey: string;
	mcpUrl: string;
	statusUrl?: string;
	serverName?: string;
}> {
	let startResponse: Response;
	try {
		startResponse = await args.fetchImpl(args.startUrl, {
			method: "POST",
			headers: {
				accept: "application/json",
			},
		});
	} catch (error) {
		throw new Error(formatControlPlaneRequestError(args.startUrl, error));
	}
	const startBody = (await startResponse.json().catch(() => ({}))) as Partial<{
		sessionId: string;
		userCode: string;
		verificationUrl: string;
		pollUrl: string;
		intervalMs: number;
		error: string;
	}>;
	if (!startResponse.ok) {
		throw new Error(
			startBody.error ||
				`CLI login start failed with status ${startResponse.status}.`,
		);
	}
	if (
		typeof startBody.verificationUrl !== "string" ||
		typeof startBody.pollUrl !== "string"
	) {
		throw new Error("CLI login start returned an invalid payload.");
	}

	args.stdout.write(
		`Open this URL to approve Bardo CLI:\n${startBody.verificationUrl}\n`,
	);
	if (typeof startBody.userCode === "string") {
		args.stdout.write(`Approval code: ${startBody.userCode}\n`);
	}
	args.stdout.write("Waiting for browser approval...\n");

	const intervalMs =
		typeof startBody.intervalMs === "number" && startBody.intervalMs > 0
			? Math.floor(startBody.intervalMs)
			: 3000;

	for (;;) {
		let pollResponse: Response;
		try {
			pollResponse = await args.fetchImpl(startBody.pollUrl, {
				method: "GET",
				headers: {
					accept: "application/json",
				},
			});
		} catch (error) {
			throw new Error(formatControlPlaneRequestError(startBody.pollUrl, error));
		}
		const pollBody = (await pollResponse.json().catch(() => ({}))) as Partial<{
			status: string;
			apiKey: string;
			mcpUrl: string;
			statusUrl: string;
			serverName: string;
			error: string;
			intervalMs: number;
		}>;

		if (pollResponse.ok && pollBody.status === "approved") {
			if (
				typeof pollBody.apiKey !== "string" ||
				typeof pollBody.mcpUrl !== "string"
			) {
				throw new Error("CLI login poll returned an invalid approved payload.");
			}
			return {
				apiKey: pollBody.apiKey,
				mcpUrl: pollBody.mcpUrl,
				statusUrl:
					typeof pollBody.statusUrl === "string"
						? pollBody.statusUrl
						: undefined,
				serverName:
					typeof pollBody.serverName === "string"
						? pollBody.serverName
						: undefined,
			};
		}

		if (pollResponse.ok && pollBody.status === "pending") {
			await args.sleep(
				typeof pollBody.intervalMs === "number" && pollBody.intervalMs > 0
					? Math.floor(pollBody.intervalMs)
					: intervalMs,
			);
			continue;
		}

		throw new Error(
			pollBody.error ||
				`CLI login approval failed with status ${pollResponse.status}.`,
		);
	}
}

async function buildDoctorReport(
	options: DoctorCommandOptions,
	deps: CliRuntimeDeps,
): Promise<DoctorOutput> {
	const env = deps.env ?? process.env;
	const config = await readConfig(resolveConfigPath(deps));
	const workspaceRoot = resolveWorkspaceRoot(
		options.workspaceRoot || env.BARDO_WORKSPACE_ROOT || null,
		deps.cwd ?? process.cwd(),
	);
	const bardoRoot = resolveBardoRoot(workspaceRoot, env);
	const manifestPath = path.join(bardoRoot, "manifest.json");
	const manifest = await readExistingJson(manifestPath);
	const envApiKey = env.BARDO_API_KEY?.trim() || null;
	const envUrl = env.BARDO_MCP_URL?.trim() || null;
	const envStatusUrl = resolveRuntimeStatusUrl({
		explicitStatusUrl: env.BARDO_RUNTIME_STATUS_URL?.trim() || null,
		controlPlaneUrls: [
			env.BARDO_LOGIN_START_URL?.trim() || null,
			env.BARDO_LOGIN_EXCHANGE_URL?.trim() || null,
			DEFAULT_LOGIN_START_URL,
		],
	});
	const url = envUrl || config?.url || null;
	const apiKey = envApiKey || config?.apiKey || null;
	const statusUrl =
		envStatusUrl ||
		resolveRuntimeStatusUrl({
			explicitStatusUrl: config?.statusUrl || null,
			controlPlaneUrls: [DEFAULT_LOGIN_START_URL],
		});
	const source: DoctorOutput["auth"]["source"] = envApiKey
		? "env"
		: config?.apiKey
			? "config"
			: "none";

	const health = await checkHealth(url, deps.fetch ?? fetch);
	const account = await checkAccountStatus({
		statusUrl,
		apiKey,
		fetchImpl: deps.fetch ?? fetch,
	});
	const client = await checkClientStatus({
		client: options.client,
		workspaceRoot,
		expectedServerName: config?.serverName ?? null,
		expectedUrl: url,
	});

	return {
		auth: {
			configured: Boolean(apiKey),
			source,
			url,
			statusUrl,
		},
		workspace: {
			workspaceRoot,
			bardoRoot,
			initialized: manifest !== null,
			manifestPath,
		},
		connectivity: {
			health,
			controlPlane: await checkControlPlaneReachability(
				statusUrl || env.BARDO_LOGIN_START_URL?.trim() || null,
				deps.fetch ?? fetch,
			),
		},
		account,
		client,
	};
}

async function checkClientStatus(args: {
	client: string | null;
	workspaceRoot: string;
	expectedServerName: string | null;
	expectedUrl: string | null;
}): Promise<DoctorOutput["client"]> {
	if (!args.client) {
		return null;
	}

	const selection = await resolveDoctorClientSelection({
		client: args.client,
		workspaceRoot: args.workspaceRoot,
	});
	const normalized = selection.client;

	const adapter = getConnectionClientAdapter(normalized);
	const configPath = selection.configPath;
	const configExists = configPath
		? await access(configPath)
				.then(() => true)
				.catch(() => false)
		: false;
	const inspection = configPath
		? await inspectClientConfig({
				client: normalized,
				configPath,
				configExists,
				expectedServerName: args.expectedServerName,
				expectedUrl: args.expectedUrl,
			})
		: {
				configValid: false,
				hasBardoServer: false,
				error: adapter.autoInstall
					? "Client config path is not available."
					: null,
				warning: null,
			};

	return {
		id: adapter.id,
		label: adapter.label,
		tier: adapter.tier,
		autoInstall: adapter.autoInstall,
		supportsLocal: adapter.supportsLocal,
		supportsRemote: adapter.supportsRemote,
		defaultConfigPath: adapter.defaultConfigPath,
		configPath,
		configExists,
		configValid: inspection.configValid,
		hasBardoServer: inspection.hasBardoServer,
		error: inspection.error,
		warning: inspection.warning,
	};
}

async function inspectClientConfig(args: {
	client: ConnectionClient;
	configPath: string;
	configExists: boolean;
	expectedServerName: string | null;
	expectedUrl: string | null;
}): Promise<{
	configValid: boolean;
	hasBardoServer: boolean;
	error: string | null;
	warning: string | null;
}> {
	if (!args.configExists) {
		return {
			configValid: false,
			hasBardoServer: false,
			error: "Client config file was not found.",
			warning: null,
		};
	}

	const adapter = getConnectionClientAdapter(args.client);
	const raw = await readFile(args.configPath, "utf8").catch(() => null);
	if (raw === null) {
		return {
			configValid: false,
			hasBardoServer: false,
			error: "Client config file could not be read.",
			warning: null,
		};
	}

	if (adapter.installVariant === "codex") {
		const detection = detectCodexBardoServer(raw, {
			serverName: args.expectedServerName,
			url: args.expectedUrl,
		});
		return {
			configValid: true,
			hasBardoServer: detection.hasBardoServer,
			error: detection.hasBardoServer
				? null
				: "Bardo server entry was not found.",
			warning: buildBardoServerWarning(detection, args.expectedUrl),
		};
	}

	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const detection = detectJsonBardoServer(args.client, parsed, {
			serverName: args.expectedServerName,
			url: args.expectedUrl,
		});
		return {
			configValid: true,
			hasBardoServer: detection.hasBardoServer,
			error: detection.hasBardoServer
				? null
				: "Bardo server entry was not found.",
			warning: buildBardoServerWarning(detection, args.expectedUrl),
		};
	} catch {
		return {
			configValid: false,
			hasBardoServer: false,
			error:
				"Invalid client config file. Fix the JSON before using this client.",
			warning: null,
		};
	}
}

function buildBardoServerWarning(
	detection: BardoServerDetection,
	expectedUrl: string | null,
): string | null {
	if (
		detection.hasBardoServer &&
		expectedUrl &&
		detection.actualUrl &&
		detection.urlMatches === false
	) {
		return `Configured Bardo server URL ${detection.actualUrl} does not match the saved MCP URL ${expectedUrl}. Re-run install or connect to update the client config.`;
	}

	return null;
}

function detectJsonBardoServer(
	client: ConnectionClient,
	payload: Record<string, unknown>,
	expected: {
		serverName: string | null;
		url: string | null;
	},
): BardoServerDetection {
	if (client === "vscode") {
		const mcp =
			typeof payload.mcp === "object" && payload.mcp !== null
				? (payload.mcp as Record<string, unknown>)
				: null;
		return detectJsonBardoServerEntry(
			mcp && typeof mcp.servers === "object" && mcp.servers !== null
				? (mcp.servers as Record<string, unknown>)
				: null,
			expected,
		);
	}

	if (client === "opencode") {
		const mcp =
			typeof payload.mcp === "object" && payload.mcp !== null
				? (payload.mcp as Record<string, unknown>)
				: null;
		return detectJsonBardoServerEntry(mcp, expected);
	}

	return detectJsonBardoServerEntry(
		typeof payload.mcpServers === "object" && payload.mcpServers !== null
			? (payload.mcpServers as Record<string, unknown>)
			: null,
		expected,
	);
}

function detectJsonBardoServerEntry(
	servers: Record<string, unknown> | null,
	expected: {
		serverName: string | null;
		url: string | null;
	},
): BardoServerDetection {
	if (!servers) {
		return {
			hasBardoServer: false,
			urlMatches: null,
			actualUrl: null,
		};
	}

	for (const [serverName, entry] of Object.entries(servers)) {
		const detection = detectBardoServerEntry(entry, {
			serverName,
			expectedServerName: expected.serverName,
			expectedUrl: expected.url,
		});
		if (detection.hasBardoServer) {
			return detection;
		}
	}

	return {
		hasBardoServer: false,
		urlMatches: null,
		actualUrl: null,
	};
}

function detectCodexBardoServer(
	raw: string,
	expected: {
		serverName: string | null;
		url: string | null;
	},
): BardoServerDetection {
	for (const table of listTomlTableBlocks(raw)) {
		if (!table.tableName.startsWith("mcp_servers.")) {
			continue;
		}
		const detection = detectBardoServerBlock(table, expected);
		if (detection.hasBardoServer) {
			return detection;
		}
	}

	return {
		hasBardoServer: false,
		urlMatches: null,
		actualUrl: null,
	};
}

function detectBardoServerEntry(
	entry: unknown,
	args: {
		serverName: string;
		expectedServerName: string | null;
		expectedUrl: string | null;
	},
): BardoServerDetection {
	if (!entry || typeof entry !== "object") {
		return {
			hasBardoServer: false,
			urlMatches: null,
			actualUrl: null,
		};
	}

	const candidate = entry as Record<string, unknown>;
	const actualUrl = typeof candidate.url === "string" ? candidate.url : null;
	const urlMatches =
		args.expectedUrl && actualUrl ? actualUrl === args.expectedUrl : null;
	const matchesExpectedName =
		args.expectedServerName !== null &&
		args.serverName === args.expectedServerName;
	const matchesDefaultName = args.serverName === "bardo";

	const tokens = collectStringTokens(entry);
	const hasPackage = tokens.includes("@bardo/mcp");
	const hasServeCommand =
		tokens.includes("bardo") &&
		tokens.includes("mcp") &&
		tokens.includes("serve");

	return {
		hasBardoServer:
			matchesExpectedName ||
			matchesDefaultName ||
			urlMatches === true ||
			hasPackage ||
			hasServeCommand,
		urlMatches,
		actualUrl,
	};
}

function detectBardoServerBlock(
	table: {
		tableName: string;
		block: string;
	},
	expected: {
		serverName: string | null;
		url: string | null;
	},
): BardoServerDetection {
	const parsedServerName = parseCodexServerName(table.tableName);
	const actualUrl = extractTomlStringValue(table.block, "url");
	const urlMatches =
		expected.url && actualUrl ? actualUrl === expected.url : null;
	const matchesExpectedName =
		expected.serverName !== null && parsedServerName === expected.serverName;
	const matchesDefaultName = parsedServerName === "bardo";
	const hasServeCommand =
		table.block.includes("@bardo/mcp") ||
		table.block.includes('"bardo","mcp","serve"');

	return {
		hasBardoServer:
			matchesExpectedName ||
			matchesDefaultName ||
			urlMatches === true ||
			hasServeCommand,
		urlMatches,
		actualUrl,
	};
}

function parseCodexServerName(tableName: string): string | null {
	if (!tableName.startsWith("mcp_servers.")) {
		return null;
	}

	const suffix = tableName.slice("mcp_servers.".length).trim();
	if (suffix.startsWith('"')) {
		try {
			const parsed = JSON.parse(suffix) as unknown;
			return typeof parsed === "string" ? parsed : null;
		} catch {
			return null;
		}
	}

	return suffix.length > 0 ? suffix : null;
}

function extractTomlStringValue(block: string, key: string): string | null {
	const prefix = `${key} =`;
	for (const line of block.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith(prefix)) {
			continue;
		}
		const rawValue = trimmed.slice(prefix.length).trim();
		if (!rawValue.startsWith('"')) {
			return null;
		}
		try {
			const parsed = JSON.parse(rawValue) as unknown;
			return typeof parsed === "string" ? parsed : null;
		} catch {
			return null;
		}
	}

	return null;
}

function collectStringTokens(value: unknown): string[] {
	if (typeof value === "string") {
		return [value];
	}

	if (Array.isArray(value)) {
		return value.flatMap((item) => collectStringTokens(item));
	}

	if (value && typeof value === "object") {
		return Object.values(value).flatMap((item) => collectStringTokens(item));
	}

	return [];
}

async function checkAccountStatus(args: {
	statusUrl: string | null;
	apiKey: string | null;
	fetchImpl: FetchLike;
}): Promise<DoctorOutput["account"]> {
	if (!args.statusUrl || !args.apiKey) {
		return {
			fetched: false,
			ok: false,
			statusUrl: args.statusUrl,
			keyId: null,
			subjectId: null,
			scopes: [],
			workspacePath: null,
			plan: null,
			mcpPeriodLimit: null,
			billingUnavailable: false,
			error: args.statusUrl
				? "Missing API key."
				: "Missing runtime status URL.",
		};
	}

	try {
		const response = await args.fetchImpl(args.statusUrl, {
			method: "GET",
			headers: {
				accept: "application/json",
				authorization: `Bearer ${args.apiKey}`,
			},
		});
		const payload = (await response.json().catch(() => ({}))) as Partial<{
			valid: boolean;
			keyId: string | null;
			subjectId: string | null;
			scopes: string[];
			workspacePath: string | null;
			plan: string | null;
			mcpPeriodLimit: number | null;
			billingUnavailable: boolean;
			error: string;
		}>;

		if (!response.ok || payload.valid !== true) {
			return {
				fetched: true,
				ok: false,
				statusUrl: args.statusUrl,
				keyId: null,
				subjectId: null,
				scopes: [],
				workspacePath: null,
				plan: null,
				mcpPeriodLimit: null,
				billingUnavailable: false,
				error:
					payload.error ||
					`Runtime status check failed with status ${response.status}.`,
			};
		}

		return {
			fetched: true,
			ok: true,
			statusUrl: args.statusUrl,
			keyId: typeof payload.keyId === "string" ? payload.keyId : null,
			subjectId:
				typeof payload.subjectId === "string" ? payload.subjectId : null,
			scopes: Array.isArray(payload.scopes)
				? payload.scopes.filter(
						(scope): scope is string =>
							typeof scope === "string" && scope.trim().length > 0,
					)
				: [],
			workspacePath:
				typeof payload.workspacePath === "string"
					? payload.workspacePath
					: null,
			plan: typeof payload.plan === "string" ? payload.plan : null,
			mcpPeriodLimit:
				typeof payload.mcpPeriodLimit === "number"
					? payload.mcpPeriodLimit
					: null,
			billingUnavailable: payload.billingUnavailable === true,
			error: null,
		};
	} catch (error) {
		return {
			fetched: true,
			ok: false,
			statusUrl: args.statusUrl,
			keyId: null,
			subjectId: null,
			scopes: [],
			workspacePath: null,
			plan: null,
			mcpPeriodLimit: null,
			billingUnavailable: false,
			error: toErrorMessage(error),
		};
	}
}

async function checkHealth(
	mcpUrl: string | null,
	fetchImpl: FetchLike,
): Promise<DoctorOutput["connectivity"]["health"]> {
	if (!mcpUrl) {
		return {
			url: null,
			ok: false,
			status: null,
			error: "Missing MCP URL.",
		};
	}

	let healthUrl: string;
	try {
		healthUrl = resolveHealthUrl(mcpUrl);
	} catch {
		return {
			url: null,
			ok: false,
			status: null,
			error: `MCP URL is not a valid URL: ${mcpUrl}`,
		};
	}

	try {
		const response = await fetchImpl(healthUrl, {
			method: "GET",
			headers: {
				accept: "application/json",
			},
		});
		return {
			url: healthUrl,
			ok: response.ok,
			status: response.status,
			error: response.ok
				? null
				: `Health check failed with status ${response.status}.`,
		};
	} catch (error) {
		return {
			url: healthUrl,
			ok: false,
			status: null,
			error: toErrorMessage(error),
		};
	}
}

async function checkControlPlaneReachability(
	url: string | null,
	fetchImpl: FetchLike,
): Promise<DoctorOutput["connectivity"]["controlPlane"]> {
	if (!url) {
		return {
			url: null,
			reachable: false,
			status: null,
			error: "Missing control plane URL.",
		};
	}

	try {
		const response = await fetchImpl(url, {
			method: "GET",
			headers: {
				accept: "application/json",
			},
		});
		return {
			url,
			reachable: true,
			status: response.status,
			error: null,
		};
	} catch (error) {
		return {
			url,
			reachable: false,
			status: null,
			error: toErrorMessage(error),
		};
	}
}

function formatControlPlaneRequestError(url: string, error: unknown): string {
	return `Could not reach the Bardo website control plane at ${url}. If you are running locally, start it with \`bun run dev:website\`. Otherwise check your BARDO_* control-plane URLs or use \`bardo login --api-key <key>\`. Root cause: ${toErrorMessage(
		error,
	)}`;
}

function resolveHealthUrl(mcpUrl: string): string {
	const url = new URL(mcpUrl);
	url.pathname = "/health";
	url.search = "";
	url.hash = "";
	return url.toString();
}

function renderDoctorReport(report: DoctorOutput): string {
	const lines = [
		"Bardo doctor",
		"",
		`Auth: ${report.auth.configured ? "configured" : "missing"} (${report.auth.source})`,
		`MCP URL: ${report.auth.url ?? "not configured"}`,
		`Runtime status URL: ${report.auth.statusUrl ?? "not configured"}`,
		`Workspace root: ${report.workspace.workspaceRoot}`,
		`Bardo root: ${report.workspace.bardoRoot}`,
		`Workspace initialized: ${report.workspace.initialized ? "yes" : "no"}`,
		`Health check: ${
			report.connectivity.health.ok
				? `ok (${report.connectivity.health.status})`
				: (report.connectivity.health.error ?? "failed")
		}`,
		`Control plane: ${
			report.connectivity.controlPlane.reachable
				? `reachable (${report.connectivity.controlPlane.status})`
				: (report.connectivity.controlPlane.error ?? "not configured")
		}`,
		`Account status: ${
			!report.account.fetched
				? "not checked"
				: report.account.ok
					? `ok (${report.account.plan ?? "unknown"}${
							report.account.mcpPeriodLimit
								? `, limit ${report.account.mcpPeriodLimit}`
								: ""
						})`
					: (report.account.error ?? "failed")
		}`,
	];
	if (report.client) {
		lines.push(
			`Client: ${report.client.label} (${report.client.id})`,
			`Client tier: ${report.client.tier}`,
			`Client auto-install: ${report.client.autoInstall ? "yes" : "no"}`,
			`Client config path: ${report.client.configPath ?? "manual / client-specific"}`,
			`Client config detected: ${report.client.configExists ? "yes" : "no"}`,
			`Client config valid: ${report.client.configValid ? "yes" : "no"}`,
			`Bardo entry detected: ${report.client.hasBardoServer ? "yes" : "no"}`,
		);
		if (report.client.error) {
			lines.push(`Client note: ${report.client.error}`);
		}
		if (report.client.warning) {
			lines.push(`Client warning: ${report.client.warning}`);
		}
	}
	return `${lines.join("\n")}\n`;
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function writeJsonFile(
	filePath: string,
	payload: Record<string, unknown>,
): Promise<void> {
	await writeTextAtomic(filePath, JSON.stringify(payload, null, 2));
}
