import {
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	RootsListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";

type Writer = {
	write(chunk: string): void;
};

type RootEntry = {
	uri: string;
	name?: string;
};

type RootsResult = {
	roots: RootEntry[];
};

type RootSource = "arg" | "cwd" | "roots";

type WorkspaceContext = {
	workspaceRoot: string;
	source: RootSource;
	roots: RootEntry[];
};

type WorkspaceRootManagerInput = {
	defaultWorkspaceRoot: string;
	defaultSource: RootSource;
	listRoots: () => Promise<RootsResult>;
};

type LocalMcpServerOptions = {
	apiKey?: string | null;
	url: string;
	workspaceRoot: string;
	stderr?: Writer;
};

type JsonSchema = Record<string, unknown>;

type LocalToolDefinition = {
	name: string;
	title: string;
	description: string;
	inputSchema: JsonSchema;
	annotations: Record<string, unknown>;
	handler: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

type RemoteToolDefinition = {
	name: string;
	title?: string;
	description?: string;
	inputSchema?: JsonSchema;
	outputSchema?: JsonSchema;
	annotations?: Record<string, unknown>;
};

const BARDO_ROOT_DIRNAME = "bardo";
const CANONICAL_DIRECTORIES = [
	"_settings",
	"context",
	"rules",
	"party",
	"entities",
	"items",
	"world",
	"quests",
	"events",
	"projections",
	"simulation",
	"state",
	"logs",
	"secrets",
	"manifests",
] as const;
const NESTED_DIRECTORIES = [
	"rules/sources/system",
	"rules/sources/rulebook",
	"rules/sources/character-sheets",
	"rules/sources/bestiary",
	"rules/sources/expansions",
	"rules/sources/homebrew",
	"world/locations",
	"world/factions",
	"party/characters",
	"logs/sessions",
] as const;

function useFlatWorkspaceLayout(
	env: Record<string, string | undefined> = process.env,
): boolean {
	return env.BARDO_WORKSPACE_LAYOUT?.trim().toLowerCase() === "flat";
}

function resolveBardoRoot(workspaceRoot: string): string {
	if (useFlatWorkspaceLayout()) {
		return workspaceRoot;
	}
	return path.join(workspaceRoot, BARDO_ROOT_DIRNAME);
}

function resolveScopedPath(rootPath: string, relativePath: string): string {
	const normalized = relativePath.replaceAll("\\", "/").trim();
	if (!normalized || normalized.startsWith("/")) {
		throw new Error("Path must be a non-empty relative path.");
	}

	const absolute = path.resolve(rootPath, normalized);
	const relative = path.relative(rootPath, absolute);
	if (
		relative === ".." ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	) {
		throw new Error("Path escapes the workspace root.");
	}

	return absolute;
}

function renderMarkdown(
	title: string,
	description: string,
	body: string,
): string {
	return `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(
		description,
	)}\n---\n\n${body}`
		.trimEnd()
		.concat("\n");
}

async function ensureWorkspaceDirectories(bardoRoot: string): Promise<void> {
	await mkdir(bardoRoot, { recursive: true });
	for (const relative of [...CANONICAL_DIRECTORIES, ...NESTED_DIRECTORIES]) {
		await mkdir(path.join(bardoRoot, relative), { recursive: true });
	}
}

async function ensureWorkspaceCoreFiles(args: {
	bardoRoot: string;
	workspaceRoot: string;
	ruleset: string | null;
	nowIso: string;
	importedRulebooks: string[];
}): Promise<void> {
	await writeFile(
		path.join(args.bardoRoot, "manifest.json"),
		JSON.stringify(
			{
				version: 1,
				createdAtISO: args.nowIso,
				updatedAtISO: args.nowIso,
				workspaceRoot: args.workspaceRoot,
				bardoRoot: args.bardoRoot,
				ruleset: args.ruleset,
				importedRulebooks: args.importedRulebooks,
			},
			null,
			2,
		),
		"utf8",
	);
	await writeFile(
		path.join(args.bardoRoot, "_settings/settings.md"),
		renderMarkdown(
			"Campaign Settings",
			"Campaign setup settings and preferences.",
			JSON.stringify({ updatedAtISO: args.nowIso }, null, 2),
		),
		"utf8",
	);
	await writeFile(
		path.join(args.bardoRoot, "state/current.md"),
		renderMarkdown(
			"Campaign State",
			"Current campaign state and memory snapshot.",
			JSON.stringify({}, null, 2),
		),
		"utf8",
	);
	await writeFile(
		path.join(args.bardoRoot, "events/history.md"),
		renderMarkdown(
			"Campaign History",
			"Chronological campaign action history log.",
			"",
		),
		"utf8",
	);
}

async function maybeImportRulebook(args: {
	bardoRoot: string;
	rulebookPath: string | null;
}): Promise<string[]> {
	if (!args.rulebookPath) {
		return [];
	}

	const absoluteSource = path.resolve(args.rulebookPath);
	const sourceContents = await readFile(absoluteSource, "utf8");
	const target = path.join(
		args.bardoRoot,
		"rules/sources/rulebook",
		path.basename(absoluteSource),
	);
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, sourceContents, "utf8");
	return [path.relative(args.bardoRoot, target).replaceAll("\\", "/")];
}

function makeToolResult(
	message: string,
	structuredContent: Record<string, unknown>,
	isError = false,
) {
	return {
		content: [{ type: "text" as const, text: message }],
		structuredContent,
		isError,
	};
}

export function resolveWorkspaceRootFromRoots(
	roots: RootEntry[],
): string | null {
	for (const root of roots) {
		if (!root.uri.startsWith("file://")) {
			continue;
		}
		try {
			return fileURLToPath(root.uri);
		} catch {}
	}
	return null;
}

export function createWorkspaceRootManager(args: WorkspaceRootManagerInput) {
	let currentRoot = path.resolve(args.defaultWorkspaceRoot);
	let source = args.defaultSource;
	let roots: RootEntry[] = [];
	let didAttemptRefresh = false;

	async function refreshFromClientRoots(): Promise<WorkspaceContext> {
		didAttemptRefresh = true;
		try {
			const result = await args.listRoots();
			roots = Array.isArray(result.roots) ? result.roots : [];
			const resolvedRoot = resolveWorkspaceRootFromRoots(roots);
			if (resolvedRoot) {
				currentRoot = path.resolve(resolvedRoot);
				source = "roots";
			}
		} catch {
			// Keep the existing workspace root when roots are unavailable.
		}

		return {
			workspaceRoot: currentRoot,
			source,
			roots: [...roots],
		};
	}

	return {
		async getWorkspaceContext(): Promise<WorkspaceContext> {
			if (!didAttemptRefresh) {
				return refreshFromClientRoots();
			}
			return {
				workspaceRoot: currentRoot,
				source,
				roots: [...roots],
			};
		},
		refreshFromClientRoots,
	};
}

function localToolDefinitions(
	manager: ReturnType<typeof createWorkspaceRootManager>,
): LocalToolDefinition[] {
	return [
		{
			name: "bardo_workspace_status",
			title: "Workspace Status",
			description:
				"Return the active workspace root, active bardo root, and whether the workspace is initialized.",
			inputSchema: {
				type: "object",
				properties: {},
				additionalProperties: false,
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
			handler: async () => {
				const context = await manager.getWorkspaceContext();
				const bardoRoot = resolveBardoRoot(context.workspaceRoot);
				const manifestPath = path.join(bardoRoot, "manifest.json");
				const initialized = await stat(manifestPath)
					.then(() => true)
					.catch(() => false);
				return {
					workspaceRoot: context.workspaceRoot,
					bardoRoot,
					source: context.source,
					roots: context.roots,
					manifestPath,
					initialized,
				};
			},
		},
		{
			name: "bardo_workspace_bootstrap",
			title: "Bootstrap Workspace",
			description:
				"Initialize the canonical Bardo workspace scaffold in the active project and optionally import a rulebook.",
			inputSchema: {
				type: "object",
				properties: {
					rulebookPath: { type: "string" },
					ruleset: { type: "string" },
				},
				additionalProperties: false,
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
			handler: async (args) => {
				const context = await manager.getWorkspaceContext();
				const bardoRoot = resolveBardoRoot(context.workspaceRoot);
				await ensureWorkspaceDirectories(bardoRoot);
				const importedRulebooks = await maybeImportRulebook({
					bardoRoot,
					rulebookPath:
						typeof args.rulebookPath === "string" ? args.rulebookPath : null,
				});
				const nowIso = new Date().toISOString();
				await ensureWorkspaceCoreFiles({
					bardoRoot,
					workspaceRoot: context.workspaceRoot,
					ruleset: typeof args.ruleset === "string" ? args.ruleset : null,
					nowIso,
					importedRulebooks,
				});
				return {
					workspaceRoot: context.workspaceRoot,
					bardoRoot,
					importedRulebooks,
					ruleset: typeof args.ruleset === "string" ? args.ruleset : null,
				};
			},
		},
		{
			name: "bardo_workspace_list",
			title: "List Workspace Paths",
			description:
				"List files and directories under the active workspace root to help the agent inspect the project safely.",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string" },
					maxEntries: { type: "number" },
				},
				additionalProperties: false,
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
			handler: async (args) => {
				const context = await manager.getWorkspaceContext();
				const basePath =
					typeof args.path === "string" && args.path.trim()
						? resolveScopedPath(context.workspaceRoot, args.path)
						: context.workspaceRoot;
				const maxEntries =
					typeof args.maxEntries === "number" && args.maxEntries > 0
						? Math.min(Math.floor(args.maxEntries), 500)
						: 200;
				const entries = await readdir(basePath, { withFileTypes: true });
				return {
					basePath,
					entries: entries.slice(0, maxEntries).map((entry) => ({
						name: entry.name,
						type: entry.isDirectory() ? "directory" : "file",
					})),
					truncated: entries.length > maxEntries,
				};
			},
		},
		{
			name: "bardo_workspace_read_text",
			title: "Read Workspace File",
			description: "Read a UTF-8 text file inside the active workspace root.",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string" },
				},
				required: ["path"],
				additionalProperties: false,
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
			handler: async (args) => {
				const context = await manager.getWorkspaceContext();
				const filePath = resolveScopedPath(
					context.workspaceRoot,
					String(args.path ?? ""),
				);
				const content = await readFile(filePath, "utf8");
				return { filePath, content };
			},
		},
		{
			name: "bardo_workspace_write_text",
			title: "Write Workspace File",
			description: "Write UTF-8 text content inside the active workspace root.",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string" },
					content: { type: "string" },
				},
				required: ["path", "content"],
				additionalProperties: false,
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
			handler: async (args) => {
				const context = await manager.getWorkspaceContext();
				const filePath = resolveScopedPath(
					context.workspaceRoot,
					String(args.path ?? ""),
				);
				await mkdir(path.dirname(filePath), { recursive: true });
				await writeFile(filePath, String(args.content ?? ""), "utf8");
				return {
					filePath,
					bytesWritten: Buffer.byteLength(String(args.content ?? ""), "utf8"),
				};
			},
		},
		{
			name: "bardo_workspace_delete_path",
			title: "Delete Workspace Path",
			description:
				"Delete a file or directory under the active workspace root.",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string" },
					recursive: { type: "boolean" },
				},
				required: ["path"],
				additionalProperties: false,
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
				openWorldHint: false,
			},
			handler: async (args) => {
				const context = await manager.getWorkspaceContext();
				const targetPath = resolveScopedPath(
					context.workspaceRoot,
					String(args.path ?? ""),
				);
				await rm(targetPath, {
					force: true,
					recursive: args.recursive === true,
				});
				return { targetPath, deleted: true };
			},
		},
	];
}

async function connectRemoteClient(options: LocalMcpServerOptions): Promise<{
	client: Client | null;
	tools: RemoteToolDefinition[];
}> {
	if (!options.apiKey) {
		return { client: null, tools: [] };
	}

	const transport = new StreamableHTTPClientTransport(new URL(options.url), {
		requestInit: {
			headers: {
				authorization: `Bearer ${options.apiKey}`,
				"x-bardo-workspace-root": options.workspaceRoot,
			},
		},
	});
	const client = new Client(
		{
			name: "bardo-local-runtime",
			version: "0.1.0",
		},
		{},
	);
	await client.connect(transport);
	const toolsResult = await client.listTools();
	return {
		client,
		tools: toolsResult.tools as RemoteToolDefinition[],
	};
}

async function closeRemoteClient(client: Client | null): Promise<void> {
	if (!client) {
		return;
	}

	try {
		await client.close();
	} catch {
		// Ignore transport shutdown errors during reconnects.
	}
}

export async function startLocalMcpServer(
	options: LocalMcpServerOptions,
): Promise<void> {
	const stderr = options.stderr ?? process.stderr;
	let remoteClient: Client | null = null;
	let remoteTools: RemoteToolDefinition[] = [];
	let remoteWorkspaceRoot: string | null = null;

	const server = new Server(
		{
			name: "bardo",
			version: "0.1.0",
		},
		{
			capabilities: {
				tools: {
					listChanged: false,
				},
			},
			instructions:
				"Use the bardo_workspace_* tools for local filesystem and bootstrap operations. Remote game-domain tools are proxied through this local server when authentication is configured.",
		},
	);
	const manager = createWorkspaceRootManager({
		defaultWorkspaceRoot: options.workspaceRoot,
		defaultSource: "cwd",
		listRoots: async () => server.listRoots(),
	});
	const localTools = localToolDefinitions(manager);
	const localToolMap = new Map(localTools.map((tool) => [tool.name, tool]));

	async function ensureRemoteConnection(): Promise<{
		client: Client | null;
		tools: RemoteToolDefinition[];
	}> {
		if (!options.apiKey) {
			return { client: null, tools: [] };
		}

		const context = await manager.getWorkspaceContext();
		if (remoteClient && remoteWorkspaceRoot === context.workspaceRoot) {
			return { client: remoteClient, tools: remoteTools };
		}

		if (remoteClient && remoteWorkspaceRoot !== context.workspaceRoot) {
			await closeRemoteClient(remoteClient);
			remoteClient = null;
			remoteTools = [];
			remoteWorkspaceRoot = null;
		}

		if (!remoteClient) {
			try {
				const remote = await connectRemoteClient({
					...options,
					workspaceRoot: context.workspaceRoot,
				});
				remoteClient = remote.client;
				remoteTools = remote.tools;
				remoteWorkspaceRoot = context.workspaceRoot;
			} catch (error) {
				remoteClient = null;
				remoteTools = [];
				remoteWorkspaceRoot = null;
				stderr.write(
					`remote MCP unavailable, continuing with local workspace tools only: ${
						error instanceof Error ? error.message : String(error)
					}\n`,
				);
			}
		}

		return { client: remoteClient, tools: remoteTools };
	}

	server.oninitialized = () => {
		void manager.refreshFromClientRoots();
	};
	server.setNotificationHandler(
		RootsListChangedNotificationSchema,
		async () => {
			await manager.refreshFromClientRoots();
		},
	);
	server.setRequestHandler(ListToolsRequestSchema, async () => {
		const remote = await ensureRemoteConnection();
		return {
			tools: [
				...localTools.map((tool) => ({
					name: tool.name,
					title: tool.title,
					description: tool.description,
					inputSchema: tool.inputSchema,
					annotations: tool.annotations,
				})),
				...remote.tools,
			],
		};
	});
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const localTool = localToolMap.get(request.params.name);
		if (localTool) {
			try {
				const payload = await localTool.handler(
					(request.params.arguments as Record<string, unknown>) ?? {},
				);
				return makeToolResult("Local workspace tool completed.", payload);
			} catch (error) {
				return makeToolResult(
					error instanceof Error ? error.message : String(error),
					{ success: false },
					true,
				);
			}
		}

		const remote = await ensureRemoteConnection();
		if (!remoteClient) {
			return makeToolResult(
				"Remote MCP is not connected. Run `bardo login` first.",
				{ success: false },
				true,
			);
		}

		try {
			return await remote.client.callTool({
				name: request.params.name,
				arguments:
					(request.params.arguments as Record<string, unknown>) ?? undefined,
			});
		} catch (error) {
			await closeRemoteClient(remoteClient);
			remoteClient = null;
			remoteTools = [];
			remoteWorkspaceRoot = null;
			return makeToolResult(
				error instanceof Error ? error.message : String(error),
				{ success: false },
				true,
			);
		}
	});

	const transport = new StdioServerTransport();
	const transportClosed = new Promise<void>((resolve, reject) => {
		transport.onclose = () => resolve();
		transport.onerror = (error) => reject(error);
	});
	await server.connect(transport);
	await transportClosed;
}
