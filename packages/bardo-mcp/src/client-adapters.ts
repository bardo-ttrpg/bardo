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

const LOCAL_ADAPTER_COMMAND = "bardo";
const LOCAL_ADAPTER_PREFIX_ARGS = ["mcp", "serve"] as const;

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
		supportsRemote: false,
		defaultConfigPath: ".mcp.json",
		installVariant: "mcpServers",
	},
	opencode: {
		id: "opencode",
		label: "OpenCode",
		tier: "tier1",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: false,
		defaultConfigPath: "opencode.json",
		installVariant: "opencode",
	},
	cursor: {
		id: "cursor",
		label: "Cursor",
		tier: "tier1",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: false,
		defaultConfigPath: ".cursor/mcp.json",
		installVariant: "mcpServers",
	},
	codex: {
		id: "codex",
		label: "Codex",
		tier: "tier1",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: false,
		defaultConfigPath: ".codex/config.toml",
		installVariant: "codex",
	},
	vscode: {
		id: "vscode",
		label: "VS Code / GitHub Copilot",
		tier: "tier1",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: false,
		defaultConfigPath: ".vscode/settings.json",
		installVariant: "vscode",
	},
	windsurf: {
		id: "windsurf",
		label: "Windsurf",
		tier: "tier1",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: false,
		defaultConfigPath: ".windsurf/mcp.json",
		installVariant: "mcpServers",
	},
	kiro: {
		id: "kiro",
		label: "Kiro",
		tier: "tier1",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: false,
		defaultConfigPath: ".kiro/settings/mcp.json",
		installVariant: "mcpServers",
	},
	kilo: {
		id: "kilo",
		label: "Kilo Code",
		tier: "tier1",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: false,
		defaultConfigPath: ".kilocode/mcp.json",
		installVariant: "mcpServers",
	},
	trae: {
		id: "trae",
		label: "Trae",
		tier: "tier2",
		autoInstall: true,
		supportsLocal: true,
		supportsRemote: false,
		defaultConfigPath: ".trae/mcp.json",
		installVariant: "mcpServers",
	},
	generic: {
		id: "generic",
		label: "Generic MCP Client",
		tier: "generic",
		autoInstall: false,
		supportsLocal: true,
		supportsRemote: false,
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

export function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatTomlKey(value: string): string {
	return /^[A-Za-z0-9_-]+$/.test(value) ? value : JSON.stringify(value);
}

export function formatCodexTableName(serverName: string): string {
	return `mcp_servers.${formatTomlKey(serverName)}`;
}

function buildLegacyCodexTableName(serverName: string): string {
	return `mcp_servers.${serverName}`;
}

type TomlTableBlock = {
	tableName: string;
	startLine: number;
	endLine: number;
	block: string;
};

function collectTomlTableBlocks(raw: string): TomlTableBlock[] {
	const lines = raw.split("\n");
	const blocks: TomlTableBlock[] = [];
	let active: {
		tableName: string;
		startLine: number;
	} | null = null;

	for (let index = 0; index < lines.length; index += 1) {
		const trimmed = stripTomlInlineComment(lines[index] ?? "").trim();
		if (
			!trimmed.startsWith("[") ||
			!trimmed.endsWith("]") ||
			trimmed.startsWith("[[") ||
			trimmed.endsWith("]]")
		) {
			continue;
		}

		const tableName = trimmed.slice(1, -1).trim();
		if (tableName.length === 0) {
			continue;
		}

		const current = active;
		if (current) {
			blocks.push({
				tableName: current.tableName,
				startLine: current.startLine,
				endLine: index,
				block: lines.slice(current.startLine, index).join("\n"),
			});
		}

		active = {
			tableName,
			startLine: index,
		};
	}

	const current = active;
	if (current) {
		blocks.push({
			tableName: current.tableName,
			startLine: current.startLine,
			endLine: lines.length,
			block: lines.slice(current.startLine).join("\n"),
		});
	}

	return blocks;
}

export function listTomlTableBlocks(raw: string): Array<{
	tableName: string;
	block: string;
}> {
	return collectTomlTableBlocks(raw).map(({ tableName, block }) => ({
		tableName,
		block,
	}));
}

function stripTomlInlineComment(line: string): string {
	let inQuotes = false;
	let escaped = false;

	for (let index = 0; index < line.length; index += 1) {
		const character = line[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === "\\") {
			escaped = true;
			continue;
		}
		if (character === '"') {
			inQuotes = !inQuotes;
			continue;
		}
		if (character === "#" && !inQuotes) {
			return line.slice(0, index).trimEnd();
		}
	}

	return line;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function buildLocalAdapterArgs(baseUrl: string): string[] {
	return [
		...LOCAL_ADAPTER_PREFIX_ARGS,
		"--url",
		baseUrl,
		"--workspace-root",
		".",
	];
}

function buildLocalAdapterCommandParts(baseUrl: string): string[] {
	return [LOCAL_ADAPTER_COMMAND, ...buildLocalAdapterArgs(baseUrl)];
}

function buildLocalAdapterShellCommand(baseUrl: string): string {
	return buildLocalAdapterCommandParts(baseUrl)
		.map((part) => shellQuote(part))
		.join(" ");
}

function buildCodexServerBlock(args: {
	mode: ConnectionMode;
	serverName: string;
	url: string;
}) {
	const tableName = formatCodexTableName(args.serverName);
	return [
		`[${tableName}]`,
		`command = ${JSON.stringify(LOCAL_ADAPTER_COMMAND)}`,
		`args = ${JSON.stringify(buildLocalAdapterArgs(args.url))}`,
		"",
	].join("\n");
}

function upsertTomlTable(
	existing: string,
	tableNames: string[],
	replacementBlock: string,
): string {
	const replacementLines = replacementBlock.trimEnd().split("\n");
	const existingLines = existing.split("\n");
	const existingBlock = collectTomlTableBlocks(existing).find((block) =>
		tableNames.includes(block.tableName),
	);

	if (existingBlock) {
		return `${[
			...existingLines.slice(0, existingBlock.startLine),
			...replacementLines,
			...existingLines.slice(existingBlock.endLine),
		]
			.join("\n")
			.replace(/\n+$/, "\n")}`;
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
	url: string;
}): Record<string, unknown> {
	const localArgs = buildLocalAdapterArgs(args.url);
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
		servers[args.serverName] = {
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
		mcp[args.serverName] = {
			type: "local",
			command: buildLocalAdapterCommandParts(args.url),
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
	servers[args.serverName] = {
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
	url: string;
	existingContent: string;
}): string {
	const adapter = getConnectionClientAdapter(args.client);
	if (adapter.installVariant === "codex") {
		const block = buildCodexServerBlock(args);
		const tableName = formatCodexTableName(args.serverName);
		const legacyTableName = buildLegacyCodexTableName(args.serverName);
		return upsertTomlTable(
			args.existingContent,
			legacyTableName === tableName
				? [tableName]
				: [tableName, legacyTableName],
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
	const baseUrl = args.baseUrl;

	switch (args.client) {
		case "claude":
			return `claude mcp add --scope user ${shellQuote(serverName)} -- ${LOCAL_ADAPTER_COMMAND} mcp serve --url ${shellQuote(baseUrl)} --workspace-root "$PWD"`;
		case "codex":
			return buildCodexServerBlock({
				mode: "local",
				serverName,
				url: baseUrl,
			}).trim();
		case "vscode":
			return `${JSON.stringify(
				mergeJsonVariant({
					variant: "vscode",
					existing: {},
					mode: args.mode,
					serverName,
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
					mode: args.mode,
					serverName,
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
					mode: args.mode,
					serverName,
					url: baseUrl,
				}),
				null,
				2,
			)}`;
		case "generic":
			return buildLocalAdapterShellCommand(baseUrl);
	}

	throw new Error(`Unsupported client ${args.client}.`);
}
