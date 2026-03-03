import {
	access,
	copyFile,
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
};

type LoginCommandOptions = {
	apiKey: string | null;
	url: string | null;
	token: string | null;
	exchangeUrl: string | null;
};

type WorkspaceCommandOptions = {
	workspaceRoot: string | null;
};

type InitCommandOptions = WorkspaceCommandOptions & {
	rulebookPath: string | null;
	ruleset: string | null;
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
};

type ResolvedServeOptions = {
	apiKey: string;
	url: string;
	workspaceRoot: string;
};

type DoctorOutput = {
	auth: {
		configured: boolean;
		source: "env" | "config" | "none";
		url: string | null;
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
		}
	}

	return { apiKey, url, token, exchangeUrl };
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
  bardo login --token <login-token> --exchange-url <https-url>
  bardo logout
  bardo init [--workspace-root <path>] [--rulebook <path>] [--ruleset <slug>]
  bardo doctor [--workspace-root <path>] [--json]
  bardo mcp serve [--api-key <key>] [--url <mcp-url>] [--workspace-root <path>]

Compatibility:
  bardo-mcp --api-key <key> [--url <mcp-url>] [--workspace-root <path>]

Notes:
  login accepts either an API key directly or a short-lived website-issued login token.
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
	};

	try {
		const startBridge =
			deps.startBridge ??
			(async (bridgeOptions: ResolvedServeOptions) =>
				startLocalMcpServer({
					apiKey: bridgeOptions.apiKey || null,
					url: bridgeOptions.url,
					workspaceRoot: bridgeOptions.workspaceRoot,
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
			updatedAtISO:
				typeof parsed.updatedAtISO === "string"
					? parsed.updatedAtISO
					: new Date(0).toISOString(),
		};
	} catch {
		return null;
	}
}

async function exchangeLoginToken(args: {
	token: string;
	exchangeUrl: string | null;
	fetchImpl: FetchLike;
}): Promise<{
	apiKey: string;
	mcpUrl: string;
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
		serverName:
			typeof body.serverName === "string" ? body.serverName : undefined,
	};
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
	const url = envUrl || config?.url || null;
	const apiKey = envApiKey || config?.apiKey || null;
	const source: DoctorOutput["auth"]["source"] = envApiKey
		? "env"
		: config?.apiKey
			? "config"
			: "none";

	const health = await checkHealth(url, deps.fetch ?? fetch);

	return {
		auth: {
			configured: Boolean(apiKey),
			source,
			url,
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
	};
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
		`Workspace root: ${report.workspace.workspaceRoot}`,
		`Bardo root: ${report.workspace.bardoRoot}`,
		`Workspace initialized: ${report.workspace.initialized ? "yes" : "no"}`,
		`Health check: ${
			report.connectivity.health.ok
				? `ok (${report.connectivity.health.status})`
				: (report.connectivity.health.error ?? "failed")
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
