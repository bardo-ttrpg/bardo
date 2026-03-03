export type ConnectionClient =
	| "claude"
	| "opencode"
	| "cursor"
	| "codex"
	| "vscode"
	| "windsurf"
	| "kiro"
	| "kilo"
	| "trae"
	| "generic";

export type AutoInstallConnectionClient = Exclude<ConnectionClient, "generic">;

export type ConnectionMode = "remote" | "local";

export type ClientSupportTier = "tier1" | "tier2" | "generic";

type JsonConfigVariant = "mcpServers" | "vscode" | "opencode";

export type ConnectionClientAdapter = {
	id: ConnectionClient;
	label: string;
	tier: ClientSupportTier;
	autoInstall: boolean;
	supportsLocal: boolean;
	supportsRemote: boolean;
	defaultConfigPath: string | null;
	installVariant?: JsonConfigVariant | "codex";
};

const LOCAL_ADAPTER_PACKAGE = "@bardo/mcp";
const LOCAL_ADAPTER_BIN = "bardo";
const LOCAL_ADAPTER_COMMAND = "bunx";
const LOCAL_ADAPTER_PREFIX_ARGS = [
	"--bun",
	"--package",
	LOCAL_ADAPTER_PACKAGE,
	LOCAL_ADAPTER_BIN,
	"mcp",
	"serve",
] as const;

const CONNECTION_CLIENT_ADAPTERS: Record<
	ConnectionClient,
	ConnectionClientAdapter
> = {
	claude: {
		id: "claude",
		label: "Claude Code",
		tier: "tier1",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: true,
		defaultConfigPath: ".mcp.json",
		installVariant: "mcpServers",
	},
	opencode: {
		id: "opencode",
		label: "OpenCode",
		tier: "tier1",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: true,
		defaultConfigPath: "opencode.json",
		installVariant: "opencode",
	},
	cursor: {
		id: "cursor",
		label: "Cursor",
		tier: "tier1",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: true,
		defaultConfigPath: ".cursor/mcp.json",
		installVariant: "mcpServers",
	},
	codex: {
		id: "codex",
		label: "Codex",
		tier: "tier1",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: true,
		defaultConfigPath: ".codex/config.toml",
		installVariant: "codex",
	},
	vscode: {
		id: "vscode",
		label: "VS Code / GitHub Copilot",
		tier: "tier1",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: true,
		defaultConfigPath: ".vscode/settings.json",
		installVariant: "vscode",
	},
	windsurf: {
		id: "windsurf",
		label: "Windsurf",
		tier: "tier1",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: true,
		defaultConfigPath: ".windsurf/mcp.json",
		installVariant: "mcpServers",
	},
	kiro: {
		id: "kiro",
		label: "Kiro",
		tier: "tier1",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: true,
		defaultConfigPath: ".kiro/settings/mcp.json",
		installVariant: "mcpServers",
	},
	kilo: {
		id: "kilo",
		label: "Kilo Code",
		tier: "tier1",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: true,
		defaultConfigPath: ".kilocode/mcp.json",
		installVariant: "mcpServers",
	},
	trae: {
		id: "trae",
		label: "Trae",
		tier: "tier2",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: true,
		defaultConfigPath: ".trae/mcp.json",
		installVariant: "mcpServers",
	},
	generic: {
		id: "generic",
		label: "Generic MCP Client",
		tier: "generic",
		autoInstall: false,
		supportsLocal: true,
		supportsRemote: true,
		defaultConfigPath: null,
	},
};

export const SUPPORTED_CONNECTION_CLIENTS: readonly ConnectionClient[] = [
	"claude",
	"cursor",
	"codex",
	"vscode",
	"opencode",
	"windsurf",
	"kiro",
	"kilo",
	"trae",
	"generic",
] as const;

export const AUTO_INSTALL_CONNECTION_CLIENTS: readonly AutoInstallConnectionClient[] =
	SUPPORTED_CONNECTION_CLIENTS.filter(
		(client): client is AutoInstallConnectionClient => client !== "generic",
	);

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeDoubleQuoted(value: string): string {
	return value.replaceAll('"', '\\"');
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function buildLocalAdapterArgs(apiKey: string, baseUrl: string): string[] {
	return [
		...LOCAL_ADAPTER_PREFIX_ARGS,
		"--api-key",
		apiKey,
		"--url",
		baseUrl,
		"--workspace-root",
		".",
	];
}

function buildLocalAdapterCommandParts(
	apiKey: string,
	baseUrl: string,
): string[] {
	return [LOCAL_ADAPTER_COMMAND, ...buildLocalAdapterArgs(apiKey, baseUrl)];
}

function buildLocalAdapterShellCommand(
	apiKey: string,
	baseUrl: string,
): string {
	return buildLocalAdapterCommandParts(apiKey, baseUrl)
		.map((part) => shellQuote(part))
		.join(" ");
}

function buildCodexServerBlock(args: {
	mode: ConnectionMode;
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
		`args = ${JSON.stringify(buildLocalAdapterArgs(args.apiKey, args.url))}`,
		"",
	].join("\n");
}

function upsertTomlTable(
	existing: string,
	tableName: string,
	replacementBlock: string,
): string {
	const escapedTable = escapeRegex(tableName);
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

function mergeJsonVariant(args: {
	variant: JsonConfigVariant;
	existing: Record<string, unknown>;
	mode: ConnectionMode;
	serverName: string;
	apiKey: string;
	url: string;
}): Record<string, unknown> {
	const localArgs = buildLocalAdapterArgs(args.apiKey, args.url);
	if (args.variant === "vscode") {
		const root = structuredClone(args.existing);
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
						command: LOCAL_ADAPTER_COMMAND,
						args: localArgs,
					};
		mcp.servers = servers;
		root.mcp = mcp;
		return root;
	}

	if (args.variant === "opencode") {
		const root = structuredClone(args.existing);
		const mcp =
			typeof root.mcp === "object" && root.mcp !== null
				? (root.mcp as Record<string, unknown>)
				: {};
		mcp[args.serverName] =
			args.mode === "remote"
				? {
						type: "remote",
						url: args.url,
						oauth: false,
						headers: {
							Authorization: `Bearer ${args.apiKey}`,
						},
						enabled: true,
					}
				: {
						type: "local",
						command: buildLocalAdapterCommandParts(args.apiKey, args.url),
						enabled: true,
					};
		root.mcp = mcp;
		return root;
	}

	const root = structuredClone(args.existing);
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
					command: LOCAL_ADAPTER_COMMAND,
					args: localArgs,
				};
	root.mcpServers = servers;
	return root;
}

export function isConnectionClient(
	value: string | null | undefined,
): value is ConnectionClient {
	return (
		typeof value === "string" &&
		(SUPPORTED_CONNECTION_CLIENTS as readonly string[]).includes(value)
	);
}

export function isAutoInstallConnectionClient(
	value: string | null | undefined,
): value is AutoInstallConnectionClient {
	return (
		typeof value === "string" &&
		(AUTO_INSTALL_CONNECTION_CLIENTS as readonly string[]).includes(value)
	);
}

export function getConnectionClientAdapter(client: ConnectionClient) {
	return CONNECTION_CLIENT_ADAPTERS[client];
}

export function listConnectionClientAdapters(): ConnectionClientAdapter[] {
	return SUPPORTED_CONNECTION_CLIENTS.map((client) =>
		getConnectionClientAdapter(client),
	);
}

export function getConnectionClientDisplayName(
	client: ConnectionClient,
): string {
	return getConnectionClientAdapter(client).label;
}

export function buildInstallConfigContent(args: {
	client: AutoInstallConnectionClient;
	mode: ConnectionMode;
	serverName: string;
	apiKey: string;
	url: string;
	existingContent: string;
}): string {
	const adapter = getConnectionClientAdapter(args.client);
	if (adapter.installVariant === "codex") {
		const block = buildCodexServerBlock(args);
		return upsertTomlTable(
			args.existingContent,
			`mcp_servers.${args.serverName}`,
			block,
		);
	}

	if (
		adapter.installVariant === "mcpServers" ||
		adapter.installVariant === "vscode" ||
		adapter.installVariant === "opencode"
	) {
		let existing: Record<string, unknown> = {};
		if (args.existingContent.trim().length) {
			try {
				existing = JSON.parse(args.existingContent) as Record<string, unknown>;
			} catch {
				throw new Error(
					"Existing config is not valid JSON. Fix or delete it before running install.",
				);
			}
		}
		return `${JSON.stringify(
			mergeJsonVariant({
				variant: adapter.installVariant,
				existing,
				mode: args.mode,
				serverName: args.serverName,
				apiKey: args.apiKey,
				url: args.url,
			}),
			null,
			2,
		)}\n`;
	}

	throw new Error(`Client ${adapter.label} does not support auto-install.`);
}

export function buildConnectionSnippet(args: {
	client: ConnectionClient;
	mode: ConnectionMode;
	baseUrl: string;
	apiKey: string;
	serverName?: string;
}): string {
	const serverName = args.serverName?.trim() || "bardo";
	const apiKey = args.apiKey;
	const baseUrl = args.baseUrl;
	const adapter = getConnectionClientAdapter(args.client);

	if (args.mode === "remote") {
		switch (args.client) {
			case "claude":
				return `claude mcp add --scope user --transport http ${shellQuote(serverName)} ${shellQuote(baseUrl)} \\
--header ${shellQuote(`Authorization: Bearer ${apiKey}`)}`;
			case "codex":
				return `[mcp_servers.${serverName}]
url = "${baseUrl}"
http_headers = { "Authorization" = "Bearer ${escapeDoubleQuoted(apiKey)}" }`;
			case "vscode":
				return `${JSON.stringify(
					mergeJsonVariant({
						variant: "vscode",
						existing: {},
						mode: "remote",
						serverName,
						apiKey,
						url: baseUrl,
					}),
					null,
					2,
				)}`;
			case "opencode":
				return `${JSON.stringify(
					mergeJsonVariant({
						variant: "opencode",
						existing: {},
						mode: "remote",
						serverName,
						apiKey,
						url: baseUrl,
					}),
					null,
					2,
				)}`;
			case "cursor":
			case "windsurf":
			case "kiro":
			case "kilo":
			case "trae":
				return `${JSON.stringify(
					mergeJsonVariant({
						variant: "mcpServers",
						existing: {},
						mode: "remote",
						serverName,
						apiKey,
						url: baseUrl,
					}),
					null,
					2,
				)}`;
			case "generic":
				return `MCP URL: ${baseUrl}
Header: Authorization: Bearer ${apiKey}`;
		}
	}

	switch (args.client) {
		case "claude":
			return `claude mcp add --scope user ${shellQuote(serverName)} -- ${LOCAL_ADAPTER_COMMAND} --bun --package ${shellQuote(LOCAL_ADAPTER_PACKAGE)} ${shellQuote(LOCAL_ADAPTER_BIN)} mcp serve --api-key ${shellQuote(apiKey)} --url ${shellQuote(baseUrl)} --workspace-root "$PWD"`;
		case "codex":
			return `[mcp_servers.${serverName}]
command = "${LOCAL_ADAPTER_COMMAND}"
args = ${JSON.stringify(
				buildLocalAdapterArgs(apiKey, baseUrl).map((value) =>
					escapeDoubleQuoted(value),
				),
			)}`;
		case "vscode":
			return `${JSON.stringify(
				mergeJsonVariant({
					variant: "vscode",
					existing: {},
					mode: "local",
					serverName,
					apiKey,
					url: baseUrl,
				}),
				null,
				2,
			)}`;
		case "opencode":
			return `${JSON.stringify(
				mergeJsonVariant({
					variant: "opencode",
					existing: {},
					mode: "local",
					serverName,
					apiKey,
					url: baseUrl,
				}),
				null,
				2,
			)}`;
		case "cursor":
		case "windsurf":
		case "kiro":
		case "kilo":
		case "trae":
			return `${JSON.stringify(
				mergeJsonVariant({
					variant: "mcpServers",
					existing: {},
					mode: "local",
					serverName,
					apiKey,
					url: baseUrl,
				}),
				null,
				2,
			)}`;
		case "generic":
			return buildLocalAdapterShellCommand(apiKey, baseUrl);
	}

	throw new Error(`Unsupported client ${adapter.label}.`);
}
