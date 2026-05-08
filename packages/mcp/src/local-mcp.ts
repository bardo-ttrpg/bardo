import { createHash, randomUUID } from "node:crypto";
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
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	RootsListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { bootstrapCampaignWorkspace } from "../../core/src/campaign-bootstrap";
import { createRuntimeToolHandlers } from "../../core/src/runtime-tools";
import { migrateLegacyWorkspaceRoot } from "../../core/src/workspace";
import { bootstrapImportedRulebook } from "./rules-bootstrap";
import { normalizeRuntimeManifest } from "./runtime-manifest";
import { resolveBardoRoot, WORKSPACE_DIRECTORIES } from "./workspace-schema";

type PlanTier = "free" | "pro";

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
	exposure?: "public" | "diagnostic";
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
const SESSION_LOCK_FILENAME = ".session.lock";
const TEMP_FILE_SUFFIX_PATTERN = /^(.*)\.[0-9a-fA-F-]+\.tmp$/;
const RULEBOOK_MODIFIED_OPTIONS = [
	"re-parse (creates new manifest)",
	"ignore (use existing manifest)",
	"diff-and-merge",
] as const;

function sha256(input: string): string {
	return createHash("sha256").update(input, "utf8").digest("hex");
}

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

async function writeTextAtomic(
	filePath: string,
	content: string,
): Promise<void> {
	const tempPath = `${filePath}.${randomUUID()}.tmp`;
	await mkdir(path.dirname(filePath), { recursive: true });
	try {
		await writeFile(tempPath, content, "utf8");
		await rename(tempPath, filePath);
	} catch (error) {
		await rm(tempPath, { force: true });
		throw error;
	}
}

async function listTempFilesRecursively(rootPath: string): Promise<string[]> {
	const pendingDirs = [rootPath];
	const tempFiles: string[] = [];
	while (pendingDirs.length > 0) {
		const currentDir = pendingDirs.pop();
		if (!currentDir) {
			continue;
		}
		const entries = await readdir(currentDir, { withFileTypes: true }).catch(
			(error: unknown) => {
				if (
					typeof error === "object" &&
					error !== null &&
					"code" in error &&
					error.code === "ENOENT"
				) {
					return [];
				}
				throw error;
			},
		);
		for (const entry of entries) {
			const fullPath = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				pendingDirs.push(fullPath);
				continue;
			}
			if (entry.isFile() && entry.name.endsWith(".tmp")) {
				tempFiles.push(fullPath);
			}
		}
	}
	return tempFiles;
}

export async function recoverWorkspaceTempFiles(args: {
	workspaceRoot: string;
}): Promise<{
	scanned: number;
	recovered: number;
	deleted: number;
}> {
	const bardoRoot = resolveBardoRoot(args.workspaceRoot);
	const candidates = await listTempFilesRecursively(bardoRoot);
	let recovered = 0;
	let deleted = 0;
	for (const tempPath of candidates) {
		const match = TEMP_FILE_SUFFIX_PATTERN.exec(tempPath);
		const targetPath = match?.[1] ?? null;
		if (!targetPath) {
			await rm(tempPath, { force: true });
			deleted += 1;
			continue;
		}
		const content = await readFile(tempPath, "utf8").catch((error: unknown) => {
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
		if (content === null) {
			continue;
		}
		if (path.extname(targetPath).toLowerCase() === ".json") {
			try {
				JSON.parse(content);
			} catch {
				await rm(tempPath, { force: true });
				deleted += 1;
				continue;
			}
		}
		const targetExists = await stat(targetPath)
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
		if (targetExists) {
			await rm(tempPath, { force: true });
			deleted += 1;
			continue;
		}
		await mkdir(path.dirname(targetPath), { recursive: true });
		await rename(tempPath, targetPath);
		recovered += 1;
	}
	return {
		scanned: candidates.length,
		recovered,
		deleted,
	};
}

type WorkspaceLockRecord = {
	pid: number;
	started_at: string;
	workspace_root: string;
};

function isLockRecord(value: unknown): value is WorkspaceLockRecord {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		typeof record.pid === "number" &&
		typeof record.started_at === "string" &&
		typeof record.workspace_root === "string"
	);
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return !(
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ESRCH"
		);
	}
}

async function acquireWorkspaceLock(
	workspaceRoot: string,
	stderr?: Writer,
): Promise<void> {
	const bardoRoot = resolveBardoRoot(workspaceRoot);
	const lockPath = path.join(bardoRoot, SESSION_LOCK_FILENAME);
	await mkdir(bardoRoot, { recursive: true });
	const recovery = await recoverWorkspaceTempFiles({ workspaceRoot });
	if ((recovery.recovered > 0 || recovery.deleted > 0) && stderr) {
		stderr.write(
			`workspace.tmp_recovery scanned=${recovery.scanned} recovered=${recovery.recovered} deleted=${recovery.deleted}\n`,
		);
	}
	const lockContent = JSON.stringify(
		{
			pid: process.pid,
			started_at: new Date().toISOString(),
			workspace_root: workspaceRoot,
		},
		null,
		2,
	);
	for (;;) {
		try {
			await writeFile(lockPath, lockContent, { encoding: "utf8", flag: "wx" });
			return;
		} catch (error) {
			if (
				typeof error !== "object" ||
				error === null ||
				!("code" in error) ||
				error.code !== "EEXIST"
			) {
				throw error;
			}
		}

		const existingRaw = await readFile(lockPath, "utf8").catch(
			(error: unknown) => {
				if (
					typeof error === "object" &&
					error !== null &&
					"code" in error &&
					error.code === "ENOENT"
				) {
					return null;
				}
				throw error;
			},
		);
		if (!existingRaw) {
			continue;
		}

		try {
			const parsed = JSON.parse(existingRaw);
			if (
				isLockRecord(parsed) &&
				parsed.pid !== process.pid &&
				isProcessAlive(parsed.pid)
			) {
				throw new Error(
					`WORKSPACE_LOCKED owner_pid=${parsed.pid} started_at=${parsed.started_at}`,
				);
			}
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.startsWith("WORKSPACE_LOCKED")
			) {
				throw error;
			}
		}

		await rm(lockPath, { force: true });
	}
}

async function releaseWorkspaceLock(workspaceRoot: string): Promise<void> {
	const lockPath = path.join(
		resolveBardoRoot(workspaceRoot),
		SESSION_LOCK_FILENAME,
	);
	const existingRaw = await readFile(lockPath, "utf8").catch(
		(error: unknown) => {
			if (
				typeof error === "object" &&
				error !== null &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return null;
			}
			throw error;
		},
	);
	if (!existingRaw) {
		return;
	}
	try {
		const parsed = JSON.parse(existingRaw);
		if (!isLockRecord(parsed) || parsed.pid !== process.pid) {
			return;
		}
	} catch {
		// If lockfile is malformed, avoid destructive cleanup.
		return;
	}
	await rm(lockPath, { force: true });
}

export async function acquireWorkspaceLockForTests(
	workspaceRoot: string,
): Promise<void> {
	await acquireWorkspaceLock(workspaceRoot);
}

export async function releaseWorkspaceLockForTests(
	workspaceRoot: string,
): Promise<void> {
	await releaseWorkspaceLock(workspaceRoot);
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
	| { deleted: true; trashed: false; targetPath: string; trashPath: null }
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

	await writeTextAtomic(filePath, content);
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

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((entry): entry is string => typeof entry === "string");
}

function toRulebookHashes(value: unknown): Record<string, string> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return {};
	}
	const result: Record<string, string> = {};
	for (const [key, rawValue] of Object.entries(value)) {
		if (typeof rawValue === "string" && rawValue.length > 0) {
			result[key] = rawValue;
		}
	}
	return result;
}

async function readWorkspaceReadinessSummary(bardoRoot: string): Promise<{
	status: "ready" | "ready-with-gaps" | "needs-user-input";
	gaps: string[];
}> {
	const readiness = await readExistingJson(
		path.join(bardoRoot, "manifests/readiness.json"),
	);
	const rawStatus = readiness?.status;
	const status: "ready" | "ready-with-gaps" | "needs-user-input" =
		rawStatus === "ready" ||
		rawStatus === "ready-with-gaps" ||
		rawStatus === "needs-user-input"
			? rawStatus
			: "needs-user-input";
	const gaps = toStringArray(readiness?.gaps);

	if (readiness) {
		return { status, gaps };
	}

	return {
		status: "needs-user-input",
		gaps: [
			"Readiness artifact is missing. Re-run init before trusting the workspace state.",
		],
	};
}

async function readWorkspaceCurrentStateSummary(bardoRoot: string): Promise<{
	currentLocation: string | null;
	activeQuests: string[];
	relevantFactions: string[];
	uncertainties: string[];
	activeCorrections: string[];
}> {
	const currentState = await readExistingJson(
		path.join(bardoRoot, "state/current-state.json"),
	);

	return {
		currentLocation:
			typeof currentState?.currentLocation === "string"
				? currentState.currentLocation
				: null,
		activeQuests: toStringArray(currentState?.activeQuests),
		relevantFactions: toStringArray(currentState?.relevantFactions),
		uncertainties: toStringArray(currentState?.uncertainties),
		activeCorrections: toStringArray(currentState?.activeCorrections),
	};
}

function deriveWorkspaceStatusNextSteps(
	readiness: "ready" | "ready-with-gaps" | "needs-user-input",
): string[] {
	if (readiness === "needs-user-input") {
		return [
			"Do not continue play yet. Resolve the readiness gaps or rerun init after updating campaign sources.",
		];
	}

	if (readiness === "ready-with-gaps") {
		return [
			"Proceed conservatively, surface the gaps explicitly, and avoid ungrounded canon writes.",
		];
	}

	return [
		"Play can continue conservatively. Use scene_turn for GM guidance and mutation tools only for validated canon changes.",
	];
}

function buildWorkspaceMutationGuardrails(): string[] {
	return [
		"Use world_sync and simulation_tick only for updates already grounded in current state, source artifacts, committed events, or explicit user correction.",
		"Do not invent plausible recentEvents, faction moves, NPC reactions, or travel outcomes just because they seem likely.",
		"Use user_correction when the player is explicitly introducing or correcting canon.",
		"Keep guesses and likely consequences in narration until Bardo can validate them.",
	];
}

async function hashImportedRulebooks(args: {
	bardoRoot: string;
	importedRulebooks: string[];
}): Promise<Record<string, string>> {
	const hashes: Record<string, string> = {};
	for (const relativePath of args.importedRulebooks) {
		const absolutePath = path.join(args.bardoRoot, relativePath);
		const content = await readFile(absolutePath, "utf8").catch(
			(error: unknown) => {
				if (
					typeof error === "object" &&
					error !== null &&
					"code" in error &&
					error.code === "ENOENT"
				) {
					return null;
				}
				throw error;
			},
		);
		if (content === null) {
			continue;
		}
		hashes[relativePath] = sha256(content);
	}
	return hashes;
}

export async function detectRulebookHashDrift(args: {
	bardoRoot: string;
}): Promise<{
	detected: boolean;
	warnings: Array<{
		warning: "RULEBOOK_MODIFIED";
		relativePath: string;
		old_hash: string;
		new_hash: string;
		options: readonly string[];
	}>;
}> {
	const manifestPath = path.join(args.bardoRoot, "manifest.json");
	const manifest = normalizeRuntimeManifest(
		await readExistingJson(manifestPath),
	);
	if (!manifest) {
		return { detected: false, warnings: [] };
	}
	const importedRulebooks = toStringArray(manifest.importedRulebooks);
	const storedHashes = toRulebookHashes(manifest.rulebookHashes);
	const warnings: Array<{
		warning: "RULEBOOK_MODIFIED";
		relativePath: string;
		old_hash: string;
		new_hash: string;
		options: readonly string[];
	}> = [];
	for (const relativePath of importedRulebooks) {
		const oldHash = storedHashes[relativePath];
		if (!oldHash) {
			continue;
		}
		const absolutePath = path.join(args.bardoRoot, relativePath);
		const content = await readFile(absolutePath, "utf8").catch(
			(error: unknown) => {
				if (
					typeof error === "object" &&
					error !== null &&
					"code" in error &&
					error.code === "ENOENT"
				) {
					return null;
				}
				throw error;
			},
		);
		if (content === null) {
			continue;
		}
		const newHash = sha256(content);
		if (newHash !== oldHash) {
			warnings.push({
				warning: "RULEBOOK_MODIFIED",
				relativePath,
				old_hash: oldHash,
				new_hash: newHash,
				options: RULEBOOK_MODIFIED_OPTIONS,
			});
		}
	}
	return {
		detected: warnings.length > 0,
		warnings,
	};
}

export async function ensureWorkspaceCoreFiles(args: {
	bardoRoot: string;
	workspaceRoot: string;
	ruleset: string | null;
	nowIso: string;
	importedRulebooks: string[];
}): Promise<void> {
	const manifestPath = path.join(args.bardoRoot, "manifest.json");
	const manifest = normalizeRuntimeManifest(
		await readExistingJson(manifestPath),
	);
	const importedRulebooks =
		args.importedRulebooks.length > 0
			? args.importedRulebooks
			: toStringArray(manifest?.importedRulebooks);
	const existingRulebookHashes = toRulebookHashes(manifest?.rulebookHashes);
	const nextRulebookHashes = {
		...existingRulebookHashes,
		...(await hashImportedRulebooks({
			bardoRoot: args.bardoRoot,
			importedRulebooks,
		})),
	};
	let rulebookBootstrap =
		typeof manifest?.rulebookBootstrap === "object" &&
		manifest.rulebookBootstrap !== null
			? manifest.rulebookBootstrap
			: null;
	const primaryRulebook = importedRulebooks[0] ?? null;
	if (primaryRulebook) {
		const sourcePath = path.join(args.bardoRoot, primaryRulebook);
		const sourceExists = await stat(sourcePath)
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
		if (sourceExists) {
			rulebookBootstrap = await bootstrapImportedRulebook({
				bardoRoot: args.bardoRoot,
				sourceRelativePath: primaryRulebook,
				nowIso: args.nowIso,
			});
		}
	}
	const campaignBootstrap = await bootstrapCampaignWorkspace({
		workspaceRoot: args.workspaceRoot,
		bardoRoot: args.bardoRoot,
		nowIso: args.nowIso,
	});
	await writeTextAtomic(
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
				importedRulebooks,
				rulebookHashes: nextRulebookHashes,
				rulebookBootstrap,
				campaignBootstrap: {
					sourceIndexPath: campaignBootstrap.sourceIndexPath,
					entitiesPath: campaignBootstrap.entitiesPath,
					currentStatePath: campaignBootstrap.currentStatePath,
					trackingProfilePath: campaignBootstrap.trackingProfilePath,
					readinessPath: campaignBootstrap.readinessPath,
					readiness: campaignBootstrap.readiness,
				},
				runtimeArtifacts: {
					conflictsPath: "manifests/conflicts.json",
					diagnosticsPath: "manifests/diagnostics.json",
					turnTracePath: "logs/turn-trace.ndjson",
					snapshotsDirectory: "snapshots",
					snapshotIndexPath: "snapshots/index.json",
				},
				capabilityManifest: toStringArray(manifest?.capabilityManifest),
				supplements: Array.isArray(manifest?.supplements)
					? manifest.supplements
					: [],
			},
			null,
			2,
		),
	);
	await ensureFile(
		path.join(args.bardoRoot, "events/state-changes.ndjson"),
		"",
	);
	await ensureFile(
		path.join(args.bardoRoot, "manifests/conflicts.json"),
		JSON.stringify(
			{
				schemaVersion: 2,
				updatedAtISO: args.nowIso,
				conflicts: [],
			},
			null,
			2,
		),
	);
	await ensureFile(
		path.join(args.bardoRoot, "manifests/diagnostics.json"),
		JSON.stringify(
			{
				schemaVersion: 2,
				updatedAtISO: args.nowIso,
				readinessStatus: campaignBootstrap.readiness.status,
				latestEventId: null,
				latestStateHash: null,
				latestSnapshotId: null,
				latestSnapshotPath: null,
				snapshotCount: 0,
				recentEventIds: [],
				activeConflictIds: [],
				correctionEventIds: [],
				integrity: {
					status: "valid",
					currentStateHash: null,
					eventLogHash: null,
					latestSnapshotHash: null,
				},
				replayStatus: {
					canReplayFromEventZero: true,
					canReplayFromLatestSnapshot: false,
					lastReplayMode: null,
				},
			},
			null,
			2,
		),
	);
	await ensureFile(path.join(args.bardoRoot, "logs/turn-trace.ndjson"), "");
	await mkdir(path.join(args.bardoRoot, "snapshots"), { recursive: true });
	await ensureFile(
		path.join(args.bardoRoot, "snapshots/index.json"),
		JSON.stringify(
			{
				schemaVersion: 2,
				updatedAtISO: args.nowIso,
				snapshots: [],
			},
			null,
			2,
		),
	);
}

export async function maybeImportRulebook(args: {
	workspaceRoot: string;
	bardoRoot: string;
	rulebookPath: string | null;
}): Promise<string[]> {
	const requestedPath = args.rulebookPath?.trim() ?? "";
	const fallbackPath = path.join(args.workspaceRoot, "rulebook.md");
	const absoluteSource = requestedPath
		? await resolveScopedPath(args.workspaceRoot, requestedPath)
		: await stat(fallbackPath)
				.then(() => fallbackPath)
				.catch((error: unknown) => {
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
	if (!absoluteSource) {
		throw new Error(
			"Rules bootstrap requires rulebook.md in the workspace root unless you pass an explicit --rulebook override.",
		);
	}

	const extension = path.extname(absoluteSource).toLowerCase();
	if (![".md", ".markdown", ".mdx", ".txt"].includes(extension)) {
		throw new Error(
			"Rulebook import currently supports markdown or text sources only. Convert PDFs to Markdown before bootstrapping.",
		);
	}

	const sourceContents = await readFile(absoluteSource, "utf8");
	const target = path.join(args.bardoRoot, "rules", "rulebook.md");
	await mkdir(path.dirname(target), { recursive: true });
	await writeTextAtomic(target, sourceContents);
	return [path.relative(args.bardoRoot, target).replaceAll("\\", "/")];
}

export async function addWorkspaceSupplement(args: {
	workspaceRoot: string;
	bardoRoot: string;
	supplementPath: string;
	scope: string;
	capabilityAdditions: string[];
	nowIso?: string;
}): Promise<{
	copiedTo: string;
	addedCapabilities: string[];
	supplementHash: string;
}> {
	if (args.scope !== "additive_only") {
		throw new Error(
			"Supplements must use scope=additive_only to avoid overriding existing capabilities.",
		);
	}

	const absoluteSource = await resolveScopedPath(
		args.workspaceRoot,
		args.supplementPath,
	);
	const sourceContents = await readFile(absoluteSource, "utf8");
	const supplementHash = sha256(sourceContents);
	const target = path.join(
		args.bardoRoot,
		"rules/sources/expansions",
		path.basename(absoluteSource),
	);
	await mkdir(path.dirname(target), { recursive: true });
	await writeTextAtomic(target, sourceContents);
	const relativeTarget = path
		.relative(args.bardoRoot, target)
		.replaceAll("\\", "/");

	const nowIso = args.nowIso ?? new Date().toISOString();
	const manifestPath = path.join(args.bardoRoot, "manifest.json");
	const manifest = (await readExistingJson(manifestPath)) ?? {};
	const currentCapabilities = toStringArray(manifest.capabilityManifest);
	const requestedCapabilities = Array.from(
		new Set(
			args.capabilityAdditions
				.map((value) => value.trim())
				.filter((value) => value.length > 0),
		),
	);
	const addedCapabilities = requestedCapabilities.filter(
		(capability) => !currentCapabilities.includes(capability),
	);
	const supplements = Array.isArray(manifest.supplements)
		? [...manifest.supplements]
		: [];
	supplements.push({
		relativePath: relativeTarget,
		scope: "additive_only",
		addedAtISO: nowIso,
		supplementHash,
		addedCapabilities,
	});

	const importedRulebooks = toStringArray(manifest.importedRulebooks);
	const nextRulebookHashes = {
		...toRulebookHashes(manifest.rulebookHashes),
		...(await hashImportedRulebooks({
			bardoRoot: args.bardoRoot,
			importedRulebooks,
		})),
	};

	await writeTextAtomic(
		manifestPath,
		JSON.stringify(
			{
				version: 1,
				createdAtISO:
					typeof manifest.createdAtISO === "string"
						? manifest.createdAtISO
						: nowIso,
				updatedAtISO: nowIso,
				workspaceRoot:
					typeof manifest.workspaceRoot === "string"
						? manifest.workspaceRoot
						: args.workspaceRoot,
				bardoRoot:
					typeof manifest.bardoRoot === "string"
						? manifest.bardoRoot
						: args.bardoRoot,
				ruleset: typeof manifest.ruleset === "string" ? manifest.ruleset : null,
				importedRulebooks,
				rulebookHashes: nextRulebookHashes,
				capabilityManifest: [...currentCapabilities, ...addedCapabilities],
				supplements,
			},
			null,
			2,
		),
	);

	const stateChangesPath = path.join(
		args.bardoRoot,
		"events/state-changes.ndjson",
	);
	const existingStateChanges = await readFile(stateChangesPath, "utf8").catch(
		(error: unknown) => {
			if (
				typeof error === "object" &&
				error !== null &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return "";
			}
			throw error;
		},
	);
	const stateChangeEntry = `${JSON.stringify({
		type: "supplement_activation",
		recordedAtISO: nowIso,
		supplement: relativeTarget,
		scope: "additive_only",
		addedCapabilities,
	})}\n`;
	await writeTextAtomic(
		stateChangesPath,
		`${existingStateChanges}${stateChangeEntry}`,
	);

	return {
		copiedTo: relativeTarget,
		addedCapabilities,
		supplementHash,
	};
}

function makeToolResult(
	message: string,
	structuredContent: Record<string, unknown>,
	isError = false,
) {
	const renderedPayload =
		Object.keys(structuredContent).length > 0
			? `\n\n${JSON.stringify(structuredContent, null, 2)}`
			: "";
	return {
		content: [{ type: "text" as const, text: `${message}${renderedPayload}` }],
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
							`direct HTTP MCP unavailable, continuing with local workspace tools only: ${
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

function planRank(plan: PlanTier): number {
	switch (plan) {
		case "free":
			return 0;
		case "pro":
			return 1;
	}
}

export function createRemoteToolAccessController(
	options: RemoteToolAccessControllerOptions,
) {
	function isAllowed(_tool: RemoteToolDefinition): boolean {
		if (!options.plan) {
			return true;
		}
		if (options.plan === "free") {
			return false;
		}
		return planRank(options.plan) >= planRank("pro");
	}

	return {
		filterTools(tools: RemoteToolDefinition[]): RemoteToolDefinition[] {
			return tools.filter((tool) => isAllowed(tool));
		},
		isAllowed,
		blockedMessage(toolName: string, _tool?: RemoteToolDefinition): string {
			const currentPlan = options.plan ?? "unknown";
			return `Remote tool "${toolName}" requires an active subscription. Current plan: ${currentPlan}.`;
		},
	};
}

function shouldExposeDiagnosticLocalTools(
	env: Record<string, string | undefined>,
): boolean {
	// Diagnostic escape hatch only. The default surface stays focused on
	// campaign grounding and safe state updates.
	return env.BARDO_EXPOSE_LOCAL_TOOLS?.trim().toLowerCase() === "true";
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

	function snapshotWorkspaceContext(): WorkspaceContext {
		return {
			workspaceRoot: currentRoot,
			source,
			roots: [...roots],
		};
	}

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
			return snapshotWorkspaceContext();
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
			return snapshotWorkspaceContext();
		},
		refreshFromClientRoots,
		hasAttemptedRefresh(): boolean {
			return didAttemptRefresh;
		},
	};
}

function localToolDefinitions(
	manager: ReturnType<typeof createWorkspaceRootManager>,
	textFileLimitBytes: number,
	ensureWorkspaceLock: (workspaceRoot: string) => Promise<void>,
): LocalToolDefinition[] {
	const runtimeToolHandlers = createRuntimeToolHandlers();
	function requireRuntimeToolHandler(name: string) {
		const handler = runtimeToolHandlers[name];
		if (typeof handler !== "function") {
			throw new Error(`Missing runtime tool handler: ${name}`);
		}
		return handler;
	}
	return [
		{
			name: "bardo_workspace_status",
			title: "Workspace Status",
			description:
				"Return the active workspace root, initialization state, readiness summary, current-state highlights, and mutation guardrails so agents know when play can continue and when canon writes would be unsafe.",
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
				await migrateLegacyWorkspaceRoot(context.workspaceRoot);
				const bardoRoot = resolveBardoRoot(context.workspaceRoot);
				const manifestPath = path.join(bardoRoot, "manifest.json");
				const initialized = await stat(manifestPath)
					.then(() => true)
					.catch(() => false);
				const rulebookHashDrift = initialized
					? await detectRulebookHashDrift({ bardoRoot })
					: {
							detected: false,
							warnings: [],
						};
				const readiness: {
					status: "ready" | "ready-with-gaps" | "needs-user-input";
					gaps: string[];
				} = initialized
					? await readWorkspaceReadinessSummary(bardoRoot)
					: {
							status: "needs-user-input",
							gaps: [
								"Workspace is not initialized yet. Run init before continuing play.",
							],
						};
				const currentStateSummary = initialized
					? await readWorkspaceCurrentStateSummary(bardoRoot)
					: {
							currentLocation: null,
							activeQuests: [],
							relevantFactions: [],
							uncertainties: [],
							activeCorrections: [],
						};
				return {
					workspaceRoot: context.workspaceRoot,
					bardoRoot,
					source: context.source,
					roots: context.roots,
					manifestPath,
					initialized,
					readiness,
					currentStateSummary,
					nextSteps: deriveWorkspaceStatusNextSteps(readiness.status),
					mutationGuardrails: buildWorkspaceMutationGuardrails(),
					rulebookHashDrift,
				};
			},
		},
		{
			name: "init",
			title: "Initialize Bardo Workspace",
			description:
				"Run rules bootstrap and campaign bootstrap for the active workspace using the strict .bardo local-first contract.",
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
				await migrateLegacyWorkspaceRoot(context.workspaceRoot);
				await ensureWorkspaceLock(context.workspaceRoot);
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
				const manifest =
					(await readExistingJson(path.join(bardoRoot, "manifest.json"))) ?? {};
				return {
					success: true,
					workspaceRoot: context.workspaceRoot,
					bardoRoot,
					manifest,
				};
			},
		},
		{
			name: "bardo_workspace_bootstrap",
			title: "Bootstrap Workspace",
			description:
				"Legacy alias for init. Initializes the canonical .bardo workspace and generates the local runtime artifacts.",
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
				await migrateLegacyWorkspaceRoot(context.workspaceRoot);
				await ensureWorkspaceLock(context.workspaceRoot);
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
					success: true,
					workspaceRoot: context.workspaceRoot,
					bardoRoot,
					importedRulebooks,
					ruleset: typeof args.ruleset === "string" ? args.ruleset : null,
					rulebookBootstrap:
						(await readExistingJson(path.join(bardoRoot, "manifest.json")))
							?.rulebookBootstrap ?? null,
				};
			},
		},
		{
			name: "scene_turn",
			title: "Resolve Scene Turn",
			description:
				"Resolve a scene turn from the local prep artifacts, consult grounded rules first, and behave like a conservative TTRPG GM without auto-promoting flavor into canon.",
			inputSchema: {
				type: "object",
				properties: {
					playerIntent: { type: "string" },
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
				await migrateLegacyWorkspaceRoot(context.workspaceRoot);
				return await requireRuntimeToolHandler("scene_turn")(args, {
					workspaceRoot: context.workspaceRoot,
					bardoRoot: resolveBardoRoot(context.workspaceRoot),
				});
			},
		},
		{
			name: "player_action",
			title: "Commit Player Action",
			description:
				"Resolve a player action into a validated state-changing event and commit only the grounded state changes.",
			inputSchema: {
				type: "object",
				properties: {
					action: { type: "string" },
					currentLocation: { type: "string" },
					activeQuests: {
						type: "array",
						items: { type: "string" },
					},
					relevantFactions: {
						type: "array",
						items: { type: "string" },
					},
					recentEvents: {
						type: "array",
						items: { type: "string" },
					},
					factsRevealed: {
						type: "array",
						items: { type: "string" },
					},
					resourcesSpent: {
						type: "array",
						items: { type: "string" },
					},
					damageTaken: {
						type: "array",
						items: { type: "string" },
					},
					factionConsequences: {
						type: "array",
						items: { type: "string" },
					},
					npcAttitudes: {
						type: "object",
						additionalProperties: { type: "string" },
					},
					clockProgress: {
						type: "array",
						items: { type: "string" },
					},
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
				await migrateLegacyWorkspaceRoot(context.workspaceRoot);
				await ensureWorkspaceLock(context.workspaceRoot);
				return await requireRuntimeToolHandler("player_action")(args, {
					workspaceRoot: context.workspaceRoot,
					bardoRoot: resolveBardoRoot(context.workspaceRoot),
				});
			},
		},
		{
			name: "user_correction",
			title: "Apply User Correction",
			description:
				"Record an explicit user correction at the highest canon precedence so later play honors the corrected truth.",
			inputSchema: {
				type: "object",
				properties: {
					correction: { type: "string" },
					currentLocation: { type: "string" },
					activeQuests: {
						type: "array",
						items: { type: "string" },
					},
					relevantFactions: {
						type: "array",
						items: { type: "string" },
					},
					recentEvents: {
						type: "array",
						items: { type: "string" },
					},
					factsRevealed: {
						type: "array",
						items: { type: "string" },
					},
					resourcesSpent: {
						type: "array",
						items: { type: "string" },
					},
					damageTaken: {
						type: "array",
						items: { type: "string" },
					},
					factionConsequences: {
						type: "array",
						items: { type: "string" },
					},
					npcAttitudes: {
						type: "object",
						additionalProperties: { type: "string" },
					},
					clockProgress: {
						type: "array",
						items: { type: "string" },
					},
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
				await migrateLegacyWorkspaceRoot(context.workspaceRoot);
				await ensureWorkspaceLock(context.workspaceRoot);
				return await requireRuntimeToolHandler("user_correction")(args, {
					workspaceRoot: context.workspaceRoot,
					bardoRoot: resolveBardoRoot(context.workspaceRoot),
				});
			},
		},
		{
			name: "world_sync",
			title: "Synchronize World State",
			description:
				"Commit validated world-state changes to the local runtime artifacts. Use only for updates already grounded in current state, source artifacts, committed events, or explicit user correction; not for inventing plausible follow-on events.",
			inputSchema: {
				type: "object",
				properties: {
					currentLocation: { type: "string" },
					activeQuests: {
						type: "array",
						items: { type: "string" },
					},
					relevantFactions: {
						type: "array",
						items: { type: "string" },
					},
					recentEvents: {
						type: "array",
						items: { type: "string" },
					},
					factsRevealed: {
						type: "array",
						items: { type: "string" },
					},
					resourcesSpent: {
						type: "array",
						items: { type: "string" },
					},
					damageTaken: {
						type: "array",
						items: { type: "string" },
					},
					factionConsequences: {
						type: "array",
						items: { type: "string" },
					},
					npcAttitudes: {
						type: "object",
						additionalProperties: { type: "string" },
					},
					clockProgress: {
						type: "array",
						items: { type: "string" },
					},
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
				await migrateLegacyWorkspaceRoot(context.workspaceRoot);
				await ensureWorkspaceLock(context.workspaceRoot);
				return await requireRuntimeToolHandler("world_sync")(args, {
					workspaceRoot: context.workspaceRoot,
					bardoRoot: resolveBardoRoot(context.workspaceRoot),
				});
			},
		},
		{
			name: "simulation_tick",
			title: "Advance Simulation",
			description:
				"Advance the local world simulation through validated state-changing events grounded in prep artifacts and current state. Do not use this to invent plausible new faction moves or recent events that are not already grounded.",
			inputSchema: {
				type: "object",
				properties: {
					tickLabel: { type: "string" },
					currentLocation: { type: "string" },
					activeQuests: {
						type: "array",
						items: { type: "string" },
					},
					relevantFactions: {
						type: "array",
						items: { type: "string" },
					},
					recentEvents: {
						type: "array",
						items: { type: "string" },
					},
					factsRevealed: {
						type: "array",
						items: { type: "string" },
					},
					resourcesSpent: {
						type: "array",
						items: { type: "string" },
					},
					damageTaken: {
						type: "array",
						items: { type: "string" },
					},
					factionConsequences: {
						type: "array",
						items: { type: "string" },
					},
					npcAttitudes: {
						type: "object",
						additionalProperties: { type: "string" },
					},
					clockProgress: {
						type: "array",
						items: { type: "string" },
					},
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
				await migrateLegacyWorkspaceRoot(context.workspaceRoot);
				await ensureWorkspaceLock(context.workspaceRoot);
				return await requireRuntimeToolHandler("simulation_tick")(args, {
					workspaceRoot: context.workspaceRoot,
					bardoRoot: resolveBardoRoot(context.workspaceRoot),
				});
			},
		},
		{
			name: "bardo_workspace_list",
			title: "List Workspace Paths",
			description:
				"List files and directories under the active workspace root to help the agent inspect the project safely.",
			exposure: "diagnostic",
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
			exposure: "diagnostic",
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
				await ensureWorkspaceLock(context.workspaceRoot);
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
			exposure: "diagnostic",
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
				await ensureWorkspaceLock(context.workspaceRoot);
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
				try {
					await writeTextAtomic(filePath, content);
				} catch (error) {
					if (
						typeof error === "object" &&
						error !== null &&
						"code" in error &&
						error.code === "ENOSPC"
					) {
						throw new Error(
							`DISK_FULL path=${filePath} bytes_needed=${bytesWritten}`,
						);
					}
					throw error;
				}
				return {
					filePath,
					bytesWritten,
				};
			},
		},
		{
			name: "bardo_workspace_add_supplement",
			title: "Add Rulebook Supplement",
			description:
				"Add a mid-campaign supplement using additive-only capability updates and log supplement activation.",
			exposure: "diagnostic",
			inputSchema: {
				type: "object",
				properties: {
					supplementPath: { type: "string" },
					scope: { type: "string" },
					capabilityAdditions: {
						type: "array",
						items: { type: "string" },
					},
				},
				required: ["supplementPath"],
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
				await ensureWorkspaceLock(context.workspaceRoot);
				const bardoRoot = resolveBardoRoot(context.workspaceRoot);
				const result = await addWorkspaceSupplement({
					workspaceRoot: context.workspaceRoot,
					bardoRoot,
					supplementPath: String(args.supplementPath ?? ""),
					scope: typeof args.scope === "string" ? args.scope : "additive_only",
					capabilityAdditions: Array.isArray(args.capabilityAdditions)
						? args.capabilityAdditions.filter(
								(value): value is string => typeof value === "string",
							)
						: [],
				});
				return {
					workspaceRoot: context.workspaceRoot,
					bardoRoot,
					...result,
				};
			},
		},
		{
			name: "bardo_workspace_delete_path",
			title: "Delete Workspace Path",
			description:
				"Move a file or directory under the active workspace root into the Bardo trash.",
			exposure: "diagnostic",
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
				await ensureWorkspaceLock(context.workspaceRoot);
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

export async function startLocalMcpServer(
	options: LocalMcpServerOptions,
): Promise<void> {
	const stderr = options.stderr ?? process.stderr;
	const env = options.env ?? process.env;
	const textFileLimitBytes = resolveTextFileLimitBytes(env);
	const lockedWorkspaces = new Set<string>();
	const ensureWorkspaceLock = async (workspaceRoot: string) => {
		if (lockedWorkspaces.has(workspaceRoot)) {
			return;
		}
		await acquireWorkspaceLock(workspaceRoot, stderr);
		lockedWorkspaces.add(workspaceRoot);
	};
	const releaseWorkspaceLocks = async () => {
		for (const workspaceRoot of lockedWorkspaces) {
			await releaseWorkspaceLock(workspaceRoot);
		}
		lockedWorkspaces.clear();
	};

	const server = new Server(
		{
			name: "bardo",
			version: "0.1.1",
		},
		{
			capabilities: {
				tools: {
					listChanged: false,
				},
			},
			instructions:
				"Use the local-first Bardo GM and world-simulation tools. Bardo reads the current workspace and .bardo artifacts through stdio; local use does not require hosted auth or billing. Bardo Pro is the separate cloud connection layer for subscribed external AI platform access.",
		},
	);
	const manager = createWorkspaceRootManager({
		defaultWorkspaceRoot: options.workspaceRoot,
		defaultSource: "cwd",
		listRoots: async () => server.listRoots(),
	});
	const localTools = localToolDefinitions(
		manager,
		textFileLimitBytes,
		ensureWorkspaceLock,
	);
	const exposeLocalTools = shouldExposeDiagnosticLocalTools(env);
	const listedLocalTools = localTools.filter(
		(tool) => tool.exposure !== "diagnostic" || exposeLocalTools,
	);
	const localToolMap = new Map(localTools.map((tool) => [tool.name, tool]));
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
		return {
			tools: [
				...listedLocalTools.map((tool) => ({
					name: tool.name,
					title: tool.title,
					description: tool.description,
					inputSchema: tool.inputSchema,
					annotations: tool.annotations,
				})),
			],
		};
	});
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const localTool = localToolMap.get(request.params.name);
		if (
			localTool &&
			(localTool.exposure !== "diagnostic" || exposeLocalTools)
		) {
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
		return makeToolResult(
			`Tool "${request.params.name}" is unavailable in the local-first runtime.`,
			{ success: false, reason: "TOOL_UNAVAILABLE" },
			true,
		);
	});

	const transport = new StdioServerTransport();
	const transportClosed = new Promise<void>((resolve, reject) => {
		transport.onclose = () => resolve();
		transport.onerror = (error) => reject(error);
	});
	await server.connect(transport);
	try {
		await transportClosed;
	} finally {
		await releaseWorkspaceLocks();
	}
}
