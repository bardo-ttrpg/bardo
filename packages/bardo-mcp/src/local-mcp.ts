import { randomUUID } from "node:crypto";
import {
	access,
	mkdir,
	readdir,
	readFile,
	realpath,
	rename,
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
import { resolveBardoRoot, WORKSPACE_DIRECTORIES } from "./workspace-schema";

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
	plan?: PlanTier | null;
	env?: Record<string, string | undefined>;
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

type PlanTier = "free" | "solo" | "solo_plus";

type RemoteConnectionResult = {
	client: Client | null;
	tools: RemoteToolDefinition[];
};

type RemoteToolAccessControllerOptions = {
	plan: PlanTier | null;
	env?: Record<string, string | undefined>;
};

type RemoteConnectionCoordinatorOptions = {
	apiKey?: string | null;
	stderr: Writer;
	getWorkspaceContext: () => Promise<WorkspaceContext>;
	connectRemoteClient: (
		workspaceRoot: string,
	) => Promise<RemoteConnectionResult>;
	closeRemoteClient: (client: Client | null) => Promise<void>;
};

const DEFAULT_TEXT_FILE_LIMIT_BYTES = 10 * 1024 * 1024;

function parsePositiveInteger(
	value: string | undefined,
	fallback: number,
): number {
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.floor(parsed);
}

function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
	const relative = path.relative(rootPath, candidatePath);
	return !(
		relative === ".." ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	);
}

async function resolveExistingPath(pathname: string): Promise<string | null> {
	let current = pathname;
	for (;;) {
		const exists = await access(current)
			.then(() => true)
			.catch(() => false);
		if (exists) {
			return current;
		}
		const parent = path.dirname(current);
		if (parent === current) {
			return null;
		}
		current = parent;
	}
}

async function resolveScopedPath(
	rootPath: string,
	relativePath: string,
): Promise<string> {
	const normalized = relativePath.replaceAll("\\", "/").trim();
	if (!normalized) {
		throw new Error("Path must be a non-empty workspace path.");
	}

	const absolute = path.isAbsolute(normalized)
		? path.resolve(normalized)
		: path.resolve(rootPath, normalized);
	if (!isPathInsideRoot(rootPath, absolute)) {
		throw new Error("Path escapes the workspace root.");
	}

	const realRoot = await realpath(rootPath);
	const existingPath = await resolveExistingPath(absolute);
	if (!existingPath) {
		throw new Error("Path escapes the workspace root.");
	}
	const realExistingPath = await realpath(existingPath);
	if (!isPathInsideRoot(realRoot, realExistingPath)) {
		throw new Error("Path escapes the workspace root.");
	}

	return absolute;
}

function resolveTextFileLimitBytes(
	env: Record<string, string | undefined>,
): number {
	return parsePositiveInteger(
		env.BARDO_WORKSPACE_TEXT_FILE_LIMIT_BYTES,
		DEFAULT_TEXT_FILE_LIMIT_BYTES,
	);
}

async function ensureReadableTextFileSize(
	filePath: string,
	limitBytes: number,
): Promise<void> {
	const details = await stat(filePath);
	if (!details.isFile()) {
		throw new Error("Path must reference a regular file.");
	}
	if (details.size > limitBytes) {
		throw new Error(
			`File is too large to read as text (${details.size} bytes > ${limitBytes} bytes).`,
		);
	}
}

async function movePathToWorkspaceTrash(args: {
	workspaceRoot: string;
	targetPath: string;
	recursive: boolean;
}): Promise<
	| { deleted: false; trashed: false; targetPath: string; trashPath: null }
	| { deleted: true; trashed: true; targetPath: string; trashPath: string }
> {
	const details = await stat(args.targetPath).catch((error: unknown) => {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return null;
		}
		throw error;
	});
	if (!details) {
		return {
			targetPath: args.targetPath,
			deleted: false,
			trashed: false,
			trashPath: null,
		};
	}

	const workspaceRoot = path.resolve(args.workspaceRoot);
	const bardoRoot = resolveBardoRoot(workspaceRoot);
	const trashRoot = path.join(bardoRoot, "_trash");
	const protectedRoots = [workspaceRoot, bardoRoot, trashRoot];
	if (
		protectedRoots.some((protectedPath) => args.targetPath === protectedPath)
	) {
		throw new Error(
			"Refusing to delete the workspace root or Bardo system root.",
		);
	}
	if (details.isDirectory() && !args.recursive) {
		throw new Error(
			"Refusing to delete a directory without recursive=true. Use workspace trash intentionally.",
		);
	}
	if (isPathInsideRoot(trashRoot, args.targetPath)) {
		await rm(args.targetPath, {
			force: true,
			recursive: args.recursive,
		});
		return {
			targetPath: args.targetPath,
			deleted: true,
			trashed: false,
			trashPath: null,
		};
	}

	const relativeTarget = path.relative(workspaceRoot, args.targetPath);
	const trashPath = path.join(
		trashRoot,
		new Date().toISOString().replaceAll(":", "-"),
		randomUUID(),
		relativeTarget,
	);
	await mkdir(path.dirname(trashPath), { recursive: true });
	await rename(args.targetPath, trashPath);
	return {
		targetPath: args.targetPath,
		deleted: true,
		trashed: true,
		trashPath,
	};
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
	for (const relative of WORKSPACE_DIRECTORIES) {
		await mkdir(path.join(bardoRoot, relative), { recursive: true });
	}
}

async function ensureFile(filePath: string, content: string): Promise<void> {
	const existing = await stat(filePath)
		.then(() => true)
		.catch(() => false);
	if (existing) {
		return;
	}

	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, content, "utf8");
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

export async function ensureWorkspaceCoreFiles(args: {
	bardoRoot: string;
	workspaceRoot: string;
	ruleset: string | null;
	nowIso: string;
	importedRulebooks: string[];
}): Promise<void> {
	const manifestPath = path.join(args.bardoRoot, "manifest.json");
	const manifest = await readExistingJson(manifestPath);
	await writeFile(
		manifestPath,
		JSON.stringify(
			{
				version: 1,
				createdAtISO:
					typeof manifest?.createdAtISO === "string"
						? manifest.createdAtISO
						: args.nowIso,
				updatedAtISO: args.nowIso,
				workspaceRoot: args.workspaceRoot,
				bardoRoot: args.bardoRoot,
				ruleset:
					args.ruleset ??
					(typeof manifest?.ruleset === "string" ? manifest.ruleset : null),
				importedRulebooks:
					args.importedRulebooks.length > 0
						? args.importedRulebooks
						: Array.isArray(manifest?.importedRulebooks)
							? manifest.importedRulebooks
							: [],
			},
			null,
			2,
		),
		"utf8",
	);
	await ensureFile(
		path.join(args.bardoRoot, "_settings/settings.md"),
		renderMarkdown(
			"Campaign Settings",
			"Campaign setup settings and preferences.",
			JSON.stringify({ updatedAtISO: args.nowIso }, null, 2),
		),
	);
	await ensureFile(
		path.join(args.bardoRoot, "state/current.md"),
		renderMarkdown(
			"Campaign State",
			"Current campaign state and memory snapshot.",
			JSON.stringify({}, null, 2),
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

export async function maybeImportRulebook(args: {
	workspaceRoot: string;
	bardoRoot: string;
	rulebookPath: string | null;
}): Promise<string[]> {
	if (!args.rulebookPath) {
		return [];
	}

	const absoluteSource = await resolveScopedPath(
		args.workspaceRoot,
		args.rulebookPath,
	);
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

export function createRemoteConnectionCoordinator(
	options: RemoteConnectionCoordinatorOptions,
) {
	let remoteClient: Client | null = null;
	let remoteTools: RemoteToolDefinition[] = [];
	let remoteWorkspaceRoot: string | null = null;
	let connectingPromise: Promise<RemoteConnectionResult> | null = null;

	async function resetRemoteConnection(): Promise<void> {
		connectingPromise = null;
		await options.closeRemoteClient(remoteClient);
		remoteClient = null;
		remoteTools = [];
		remoteWorkspaceRoot = null;
	}

	return {
		async invalidate(): Promise<void> {
			await resetRemoteConnection();
		},
		async ensureRemoteConnection(): Promise<RemoteConnectionResult> {
			if (!options.apiKey) {
				return { client: null, tools: [] };
			}

			const context = await options.getWorkspaceContext();
			if (remoteClient && remoteWorkspaceRoot === context.workspaceRoot) {
				return { client: remoteClient, tools: remoteTools };
			}

			if (
				remoteClient &&
				remoteWorkspaceRoot &&
				remoteWorkspaceRoot !== context.workspaceRoot
			) {
				await resetRemoteConnection();
			}

			if (!connectingPromise) {
				connectingPromise = (async () => {
					try {
						const remote = await options.connectRemoteClient(
							context.workspaceRoot,
						);
						remoteClient = remote.client;
						remoteTools = remote.tools;
						remoteWorkspaceRoot = context.workspaceRoot;
						return {
							client: remoteClient,
							tools: remoteTools,
						};
					} catch (error) {
						remoteClient = null;
						remoteTools = [];
						remoteWorkspaceRoot = null;
						options.stderr.write(
							`remote MCP unavailable, continuing with local workspace tools only: ${
								error instanceof Error ? error.message : String(error)
							}\n`,
						);
						return { client: null, tools: [] };
					} finally {
						connectingPromise = null;
					}
				})();
			}

			return connectingPromise;
		},
	};
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

function planRank(plan: PlanTier): number {
	switch (plan) {
		case "free":
			return 0;
		case "solo":
			return 1;
		case "solo_plus":
			return 2;
	}
}

function parseToolNameList(value: string | undefined): Set<string> {
	return new Set(
		(value ?? "")
			.split(",")
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0),
	);
}

function annotatedToolPlan(tool: RemoteToolDefinition): PlanTier | null {
	const annotations =
		typeof tool.annotations === "object" && tool.annotations !== null
			? tool.annotations
			: {};
	for (const key of [
		"x-bardo-min-plan",
		"bardo:min-plan",
		"bardo_min_plan",
		"bardoMinPlan",
		"requiredPlan",
	]) {
		const plan = normalizePlan((annotations as Record<string, unknown>)[key]);
		if (plan) {
			return plan;
		}
	}
	return null;
}

function requiredPlanForTool(
	tool: RemoteToolDefinition,
	options: RemoteToolAccessControllerOptions,
): PlanTier {
	const annotated = annotatedToolPlan(tool);
	if (annotated) {
		return annotated;
	}

	const env = options.env ?? process.env;
	const soloPlusTools = parseToolNameList(env.BARDO_SOLO_PLUS_REMOTE_TOOLS);
	if (soloPlusTools.has(tool.name)) {
		return "solo_plus";
	}
	const premiumTools = parseToolNameList(env.BARDO_PREMIUM_REMOTE_TOOLS);
	if (premiumTools.has(tool.name)) {
		return "solo";
	}
	return "free";
}

export function createRemoteToolAccessController(
	options: RemoteToolAccessControllerOptions,
) {
	function isAllowed(tool: RemoteToolDefinition): boolean {
		if (!options.plan) {
			return true;
		}
		const requiredPlan = requiredPlanForTool(tool, options);
		return planRank(options.plan) >= planRank(requiredPlan);
	}

	return {
		filterTools(tools: RemoteToolDefinition[]): RemoteToolDefinition[] {
			return tools.filter((tool) => isAllowed(tool));
		},
		isAllowed,
		blockedMessage(toolName: string, tool?: RemoteToolDefinition): string {
			const requiredPlan = requiredPlanForTool(
				tool ?? { name: toolName },
				options,
			);
			const currentPlan = options.plan ?? "unknown";
			return `Remote tool "${toolName}" requires the ${requiredPlan} plan. Current plan: ${currentPlan}.`;
		},
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
	let refreshPromise: Promise<WorkspaceContext> | null = null;

	async function refreshFromClientRoots(): Promise<WorkspaceContext> {
		didAttemptRefresh = true;
		refreshPromise ??= (async () => {
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
		})().finally(() => {
			refreshPromise = null;
		});
		return refreshPromise;
	}

	return {
		async getWorkspaceContext(): Promise<WorkspaceContext> {
			if (refreshPromise) {
				return refreshPromise;
			}
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
	textFileLimitBytes: number,
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
					workspaceRoot: context.workspaceRoot,
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
						? await resolveScopedPath(context.workspaceRoot, args.path)
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
				const filePath = await resolveScopedPath(
					context.workspaceRoot,
					String(args.path ?? ""),
				);
				await ensureReadableTextFileSize(filePath, textFileLimitBytes);
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
				const filePath = await resolveScopedPath(
					context.workspaceRoot,
					String(args.path ?? ""),
				);
				const content = String(args.content ?? "");
				const bytesWritten = Buffer.byteLength(content, "utf8");
				if (bytesWritten > textFileLimitBytes) {
					throw new Error(
						`Content is too large to write as text (${bytesWritten} bytes > ${textFileLimitBytes} bytes).`,
					);
				}
				await mkdir(path.dirname(filePath), { recursive: true });
				await writeFile(filePath, content, "utf8");
				return {
					filePath,
					bytesWritten,
				};
			},
		},
		{
			name: "bardo_workspace_delete_path",
			title: "Delete Workspace Path",
			description:
				"Move a file or directory under the active workspace root into the Bardo trash.",
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
				const targetPath = await resolveScopedPath(
					context.workspaceRoot,
					String(args.path ?? ""),
				);
				return movePathToWorkspaceTrash({
					workspaceRoot: context.workspaceRoot,
					targetPath,
					recursive: args.recursive === true,
				});
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
	const textFileLimitBytes = resolveTextFileLimitBytes(
		options.env ?? process.env,
	);
	const toolAccess = createRemoteToolAccessController({
		plan: options.plan ?? null,
		env: options.env ?? process.env,
	});

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
	const localTools = localToolDefinitions(manager, textFileLimitBytes);
	const localToolMap = new Map(localTools.map((tool) => [tool.name, tool]));
	const remoteConnection = createRemoteConnectionCoordinator({
		apiKey: options.apiKey,
		stderr,
		getWorkspaceContext: () => manager.getWorkspaceContext(),
		connectRemoteClient: async (workspaceRoot) =>
			connectRemoteClient({
				...options,
				workspaceRoot,
			}),
		closeRemoteClient,
	});

	server.oninitialized = () => {
		void manager.refreshFromClientRoots();
	};
	server.setNotificationHandler(
		RootsListChangedNotificationSchema,
		async () => {
			await manager.refreshFromClientRoots();
			await remoteConnection.invalidate();
		},
	);
	server.setRequestHandler(ListToolsRequestSchema, async () => {
		const remote = await remoteConnection.ensureRemoteConnection();
		return {
			tools: [
				...localTools.map((tool) => ({
					name: tool.name,
					title: tool.title,
					description: tool.description,
					inputSchema: tool.inputSchema,
					annotations: tool.annotations,
				})),
				...toolAccess.filterTools(remote.tools),
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

		const remote = await remoteConnection.ensureRemoteConnection();
		if (!remote.client) {
			return makeToolResult(
				"Remote MCP is not connected. Run `bardo login` first.",
				{ success: false },
				true,
			);
		}

		const remoteTool = remote.tools.find(
			(tool) => tool.name === request.params.name,
		);
		if (remoteTool && !toolAccess.isAllowed(remoteTool)) {
			return makeToolResult(
				toolAccess.blockedMessage(request.params.name, remoteTool),
				{
					success: false,
					requiredPlan: requiredPlanForTool(remoteTool, {
						plan: options.plan ?? null,
						env: options.env ?? process.env,
					}),
				},
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
			await remoteConnection.invalidate();
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
