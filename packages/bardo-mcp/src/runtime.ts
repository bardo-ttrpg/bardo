import {
	access,
	copyFile,
	cp,
	mkdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startLocalMcpServer } from "./local-mcp";
import { resolveBardoRoot, WORKSPACE_DIRECTORIES } from "./workspace-schema";

const DEFAULT_MCP_URL = "http://127.0.0.1:3000/mcp";
const CONFIG_FILE_NAME = "config.json";

type Writer = {
	write(chunk: string): void;
};

type FetchLike = typeof fetch;

type SavedConfig = {
	apiKey: string;
	url: string;
	updatedAtISO: string;
	serverName?: string;
	statusUrl?: string;
};

type PlanTier = "free" | "solo" | "solo_plus";

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

type ExportCommandOptions = WorkspaceCommandOptions & {
	outputPath: string | null;
};

type PackDebugCommandOptions = WorkspaceCommandOptions & {
	outputPath: string | null;
};

type DoctorCommandOptions = WorkspaceCommandOptions & {
	json: boolean;
};

export type ServeCommandOptions = WorkspaceCommandOptions & {
	apiKey: string | null;
	url: string | null;
};

type ParsedCliCommand =
	| { command: "help" }
	| { command: "login"; options: LoginCommandOptions }
	| { command: "logout" }
	| { command: "init"; options: InitCommandOptions }
	| { command: "install"; options: InstallCommandOptions }
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
};

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
	let json = false;

	for (let index = 0; index < argv.length; index += 1) {
		const workspace = parseWorkspaceRootOption(argv, index);
		if (workspace.workspaceRoot) {
			workspaceRoot = workspace.workspaceRoot;
			index = workspace.nextIndex;
			continue;
		}

		if (argv[index] === "--json") {
			json = true;
		}
	}

	return { workspaceRoot, json };
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
		case "login":
			return handleLogin(parsed.options, deps, stdout, stderr);
		case "logout":
			return handleLogout(deps, stdout);
		case "init":
			return handleInit(parsed.options, deps, stdout, stderr);
		case "install":
			return handleInstall(parsed.options, deps, stdout, stderr);
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
  bardo login --api-key <key> [--url <mcp-url>]
  bardo login --token <login-token> --exchange-url <https-url> [--status-url <https-url>]
  bardo login [--start-url <https-url>]
  bardo logout
  bardo init [--workspace-root <path>] [--rulebook <path>] [--ruleset <slug>]
  bardo install --client <codex|cursor|windsurf|vscode> [--mode <local|remote>] [--config-path <path>] [--dry-run]
  bardo export --output <path> [--workspace-root <path>]
  bardo pack-debug --output <path> [--workspace-root <path>]
  bardo doctor [--workspace-root <path>] [--json]
  bardo mcp serve [--api-key <key>] [--url <mcp-url>] [--workspace-root <path>]

Compatibility:
  bardo-mcp --api-key <key> [--url <mcp-url>] [--workspace-root <path>]

Notes:
  login accepts either an API key directly or a short-lived website-issued login token.
  Without arguments, login can start a browser approval flow against the website control plane.
  --status-url lets doctor fetch plan and key status details from the website control plane.
  The workspace root defaults to the current working directory.
`;
}

async function handleLogin(
	options: LoginCommandOptions,
	deps: CliRuntimeDeps,
	stdout: Writer,
	stderr: Writer,
): Promise<number> {
	const env = deps.env ?? process.env;
	let apiKey = options.apiKey?.trim() || env.BARDO_API_KEY?.trim() || null;
	let url = options.url?.trim() || env.BARDO_MCP_URL?.trim() || DEFAULT_MCP_URL;
	let serverName: string | undefined;
	let statusUrl =
		options.statusUrl?.trim() || env.BARDO_RUNTIME_STATUS_URL?.trim() || null;

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
			startUrl:
				options.startUrl?.trim() ||
				env.BARDO_LOGIN_START_URL?.trim() ||
				"https://app.bardo.ai/api/connect/cli-session/start",
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
		apiKey,
		url,
		updatedAtISO: now,
		serverName,
		statusUrl: statusUrl ?? undefined,
	});
	stdout.write(`Saved Bardo credentials to ${resolveConfigPath(deps)}\n`);
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
		const importedRulebooks = await maybeImportRulebook({
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
		const client = normalizeInstallClient(options.client);
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
		const nextContent = await buildClientConfigContent({
			client,
			mode,
			serverName,
			apiKey: credentials.apiKey,
			url: credentials.url,
			configPath,
		});

		if (options.dryRun) {
			stdout.write(`${nextContent}\n`);
			return 0;
		}

		await mkdir(path.dirname(configPath), { recursive: true });
		await writeFile(configPath, nextContent, "utf8");
		stdout.write(`Installed Bardo MCP config at ${configPath}\n`);
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
		await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
		await writeFile(
			resolvedOutputPath,
			JSON.stringify(payload, null, 2),
			"utf8",
		);
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

		return report.auth.configured && report.connectivity.health.ok ? 0 : 1;
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
		env.BARDO_RUNTIME_STATUS_URL?.trim() || config?.statusUrl?.trim() || null;
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

function normalizePlan(value: unknown): PlanTier | null {
	switch (typeof value === "string" ? value.trim().toLowerCase() : "") {
		case "free":
			return "free";
		case "solo":
			return "solo";
		case "solo_plus":
		case "solo-plus":
		case "soloplus":
			return "solo_plus";
		default:
			return null;
	}
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

	try {
		const response = await args.fetchImpl(args.statusUrl, {
			headers: {
				authorization: `Bearer ${args.apiKey}`,
			},
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
		args.stderr.write(
			`runtime status request failed; continuing without plan-aware filtering: ${toErrorMessage(
				error,
			)}\n`,
		);
		return null;
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

async function maybeImportRulebook(args: {
	bardoRoot: string;
	rulebookPath: string | null;
}): Promise<string[]> {
	if (!args.rulebookPath) {
		return [];
	}

	const absoluteSource = path.resolve(args.rulebookPath);
	const sourceName = path.basename(absoluteSource);
	const target = path.join(
		args.bardoRoot,
		"rules/sources/rulebook",
		sourceName,
	);
	await mkdir(path.dirname(target), { recursive: true });
	await copyFile(absoluteSource, target);
	return [path.relative(args.bardoRoot, target).replaceAll("\\", "/")];
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
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, JSON.stringify(config, null, 2), "utf8");
}

async function readConfig(filePath: string): Promise<SavedConfig | null> {
	try {
		const raw = await readFile(filePath, "utf8");
		const parsed = JSON.parse(raw) as Partial<SavedConfig>;
		if (typeof parsed.apiKey !== "string" || typeof parsed.url !== "string") {
			return null;
		}
		return {
			apiKey: parsed.apiKey,
			url: parsed.url,
			serverName:
				typeof parsed.serverName === "string" ? parsed.serverName : undefined,
			statusUrl:
				typeof parsed.statusUrl === "string" ? parsed.statusUrl : undefined,
			updatedAtISO:
				typeof parsed.updatedAtISO === "string"
					? parsed.updatedAtISO
					: new Date(0).toISOString(),
		};
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

function normalizeInstallClient(
	value: string | null,
): "codex" | "cursor" | "windsurf" | "vscode" {
	switch (value?.trim().toLowerCase()) {
		case "codex":
		case "cursor":
		case "windsurf":
		case "vscode":
			return value.trim().toLowerCase() as
				| "codex"
				| "cursor"
				| "windsurf"
				| "vscode";
		default:
			throw new Error(
				"Unsupported client. Use codex, cursor, windsurf, or vscode.",
			);
	}
}

function normalizeInstallMode(value: string | null): "local" | "remote" {
	const normalized = value?.trim().toLowerCase() || "local";
	if (normalized === "local" || normalized === "remote") {
		return normalized;
	}
	throw new Error("Unsupported mode. Use local or remote.");
}

function resolveInstallConfigPath(args: {
	client: "codex" | "cursor" | "windsurf" | "vscode";
	workspaceRoot: string;
	configPath: string | null;
}): string {
	if (args.configPath?.trim()) {
		return path.resolve(args.workspaceRoot, args.configPath.trim());
	}

	switch (args.client) {
		case "codex":
			return path.join(args.workspaceRoot, ".codex/config.toml");
		case "cursor":
			return path.join(args.workspaceRoot, ".cursor/mcp.json");
		case "windsurf":
			return path.join(args.workspaceRoot, ".windsurf/mcp.json");
		case "vscode":
			return path.join(args.workspaceRoot, ".vscode/settings.json");
	}
}

async function buildClientConfigContent(args: {
	client: "codex" | "cursor" | "windsurf" | "vscode";
	mode: "local" | "remote";
	serverName: string;
	apiKey: string;
	url: string;
	configPath: string;
}): Promise<string> {
	if (args.client === "codex") {
		const block = buildCodexServerBlock(args);
		const existing = await readFile(args.configPath, "utf8").catch(() => "");
		return upsertTomlTable(existing, `mcp_servers.${args.serverName}`, block);
	}

	const existing = await readFile(args.configPath, "utf8")
		.then((raw) => JSON.parse(raw) as Record<string, unknown>)
		.catch(() => ({}));
	const next = mergeClientJsonConfig(existing, args);
	return `${JSON.stringify(next, null, 2)}\n`;
}

function buildCodexServerBlock(args: {
	mode: "local" | "remote";
	serverName: string;
	apiKey: string;
	url: string;
}) {
	if (args.mode === "remote") {
		return [
			`[mcp_servers.${args.serverName}]`,
			`url = ${JSON.stringify(args.url)}`,
			`http_headers = { "Authorization" = ${JSON.stringify(
				`Bearer ${args.apiKey}`,
			)} }`,
			"",
		].join("\n");
	}

	return [
		`[mcp_servers.${args.serverName}]`,
		`command = "bunx"`,
		`args = ${JSON.stringify([
			"--bun",
			"--package",
			"@bardo/mcp",
			"bardo",
			"mcp",
			"serve",
			"--api-key",
			args.apiKey,
			"--url",
			args.url,
			"--workspace-root",
			".",
		])}`,
		"",
	].join("\n");
}

function upsertTomlTable(
	existing: string,
	tableName: string,
	replacementBlock: string,
): string {
	const escapedTable = tableName.replaceAll(".", "\\.");
	const pattern = new RegExp(
		String.raw`^\[${escapedTable}\]\n(?:.*\n)*?(?=^\[|\s*$)`,
		"m",
	);
	if (pattern.test(existing)) {
		return existing.replace(pattern, replacementBlock);
	}
	const trimmed = existing.trimEnd();
	return trimmed.length > 0
		? `${trimmed}\n\n${replacementBlock}`
		: replacementBlock;
}

function mergeClientJsonConfig(
	existing: Record<string, unknown>,
	args: {
		client: "cursor" | "windsurf" | "vscode";
		mode: "local" | "remote";
		serverName: string;
		apiKey: string;
		url: string;
	},
): Record<string, unknown> {
	if (args.client === "vscode") {
		const root = structuredClone(existing);
		const mcp =
			typeof root.mcp === "object" && root.mcp !== null
				? (root.mcp as Record<string, unknown>)
				: {};
		const servers =
			typeof mcp.servers === "object" && mcp.servers !== null
				? (mcp.servers as Record<string, unknown>)
				: {};
		servers[args.serverName] =
			args.mode === "remote"
				? {
						type: "http",
						url: args.url,
						headers: {
							Authorization: `Bearer ${args.apiKey}`,
						},
					}
				: {
						type: "stdio",
						command: "bunx",
						args: [
							"--bun",
							"--package",
							"@bardo/mcp",
							"bardo",
							"mcp",
							"serve",
							"--api-key",
							args.apiKey,
							"--url",
							args.url,
							"--workspace-root",
							".",
						],
					};
		mcp.servers = servers;
		root.mcp = mcp;
		return root;
	}

	const root = structuredClone(existing);
	const servers =
		typeof root.mcpServers === "object" && root.mcpServers !== null
			? (root.mcpServers as Record<string, unknown>)
			: {};
	servers[args.serverName] =
		args.mode === "remote"
			? {
					url: args.url,
					headers: {
						Authorization: `Bearer ${args.apiKey}`,
					},
				}
			: {
					command: "bunx",
					args: [
						"--bun",
						"--package",
						"@bardo/mcp",
						"bardo",
						"mcp",
						"serve",
						"--api-key",
						args.apiKey,
						"--url",
						args.url,
						"--workspace-root",
						".",
					],
				};
	root.mcpServers = servers;
	return root;
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

	const response = await args.fetchImpl(args.exchangeUrl, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json",
		},
		body: JSON.stringify({ token: args.token }),
	});
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
	const startResponse = await args.fetchImpl(args.startUrl, {
		method: "POST",
		headers: {
			accept: "application/json",
		},
	});
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
		const pollResponse = await args.fetchImpl(startBody.pollUrl, {
			method: "GET",
			headers: {
				accept: "application/json",
			},
		});
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
	const envStatusUrl = env.BARDO_RUNTIME_STATUS_URL?.trim() || null;
	const url = envUrl || config?.url || null;
	const apiKey = envApiKey || config?.apiKey || null;
	const statusUrl = envStatusUrl || config?.statusUrl || null;
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
		},
		account,
	};
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

	try {
		const healthUrl = resolveHealthUrl(mcpUrl);
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
			url: resolveHealthUrl(mcpUrl),
			ok: false,
			status: null,
			error: toErrorMessage(error),
		};
	}
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
	return `${lines.join("\n")}\n`;
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function writeJsonFile(
	filePath: string,
	payload: Record<string, unknown>,
): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}
