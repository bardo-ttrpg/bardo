import type { Dirent } from "node:fs";
import { mkdir, open, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { parseJsonObject } from "../../../domain/campaign/json";
import {
	parseMarkdown,
	renderMarkdown,
} from "../../../domain/markdown/markdown";
import {
	ensureParentDirectoryExists,
	readTextIfExists,
	resolveBardoRoot,
	writeTextAtomic,
} from "../../../infra/filesystem/filesystem";
import {
	recordSetupFlowMetric,
	recordSetupScanCacheMetric,
} from "../../../telemetry";
import { ensureContextRepositoryScaffold } from "./context-repo";
import {
	type CoreIntegrityResult,
	validateCoreIntegrity,
} from "./core-integrity";
import { ensureInitDirectories } from "./directories";
import { type InitPaths, resolveInitPaths } from "./paths";
import { readJsonMarkdown } from "./settings";
import type {
	SetupAnswers,
	SourceMaterialsStatus,
	SourcePolicy,
} from "./setup-schemas";
import { runBootstrapStep } from "./shared";

const LOCK_TTL_MS = 30_000;
const MAX_EVIDENCE_FILES = 500;
const SCAN_CACHE_VERSION = 1;
const SKIP_SCAN_DIRECTORIES = new Set([
	"_settings",
	"state",
	"world",
	".git",
	"node_modules",
	".next",
	".turbo",
	"dist",
	"build",
]);
const TEXT_EVIDENCE_EXTENSIONS = new Set([
	".md",
	".txt",
	".json",
	".yaml",
	".yml",
	".csv",
]);

type SetupStatus = "needs_input" | "complete" | "error" | "locked";
type EvidenceConfidence = "low" | "medium" | "high";

type SetupState = {
	revision: number;
	status: SetupStatus;
	pendingAction: string | null;
	answers: {
		ttrpgSystem: string | null;
		systemUrl: string | null;
		sourceMaterialsStatus: SourceMaterialsStatus | null;
		diceRoller: "player" | "bardo" | null;
		playerCount: number | null;
		sourcePolicy: SourcePolicy;
		additionalContext: string | null;
		materialsConfirmation: string | null;
	};
	warnings: string[];
	evidenceSummary: string[];
	updatedAtISO: string | null;
	completedAtISO: string | null;
};

type EvidenceItem = {
	path: string;
	confidence: EvidenceConfidence;
	score: number;
};

type EvidenceByCategory = {
	system: EvidenceItem[];
	rulebook: EvidenceItem[];
	"character-sheets": EvidenceItem[];
	bestiary: EvidenceItem[];
	expansions: EvidenceItem[];
	homebrew: EvidenceItem[];
};

type ScanCacheEntry = {
	path: string;
	size: number;
	mtimeMs: number;
	evidence: EvidenceByCategory;
};

type ScanCacheState = {
	version: number;
	updatedAtISO: string | null;
	files: ScanCacheEntry[];
};

export type GuidedSetupFlowResult = {
	status: SetupStatus;
	message: string;
	revision: number;
	questionKey: string | null;
	question: string | null;
	progressAnswered: number;
	progressTotal: number;
	pendingAction: string | null;
	actionToExecute: string | null;
	warnings: string[];
	evidenceSummary: string[];
	conflict: {
		detected: boolean;
		reason: string | null;
	};
	integrity: CoreIntegrityResult;
	bootstrap: {
		complete: boolean;
		alreadyInitialized: boolean;
		pendingQuestionKey: Awaited<
			ReturnType<typeof runBootstrapStep>
		>["pendingQuestionKey"];
		nextPrompt: string | null;
		includeValues: boolean;
		answeredCount: number;
		totalQuestions: number;
		bootstrapPath: string;
		identityPath: string;
		userPath: string;
		soulPath: string;
	};
	answers: SetupState["answers"];
};

const REQUIRED_SETUP_KEYS = [
	"ttrpgSystem",
	"sourceMaterialsStatus",
	"diceRoller",
	"playerCount",
] as const;

function defaultSetupState(): SetupState {
	return {
		revision: 0,
		status: "needs_input",
		pendingAction: null,
		answers: {
			ttrpgSystem: null,
			systemUrl: null,
			sourceMaterialsStatus: null,
			diceRoller: null,
			playerCount: null,
			sourcePolicy: "allow_conservative_skeleton",
			additionalContext: null,
			materialsConfirmation: null,
		},
		warnings: [],
		evidenceSummary: [],
		updatedAtISO: null,
		completedAtISO: null,
	};
}

function emptyEvidenceByCategory(): EvidenceByCategory {
	return {
		system: [],
		rulebook: [],
		"character-sheets": [],
		bestiary: [],
		expansions: [],
		homebrew: [],
	};
}

function defaultScanCacheState(): ScanCacheState {
	return {
		version: SCAN_CACHE_VERSION,
		updatedAtISO: null,
		files: [],
	};
}

function toTrimmedString(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toNullablePositiveInteger(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}
	if (!Number.isInteger(value) || value < 1 || value > 20) {
		return null;
	}
	return value;
}

function normalizeSetupState(raw: unknown): SetupState {
	if (typeof raw !== "object" || raw === null) {
		return defaultSetupState();
	}

	const record = raw as Record<string, unknown>;
	const rawAnswers =
		typeof record.answers === "object" && record.answers !== null
			? (record.answers as Record<string, unknown>)
			: {};

	const status =
		record.status === "needs_input" ||
		record.status === "complete" ||
		record.status === "error" ||
		record.status === "locked"
			? record.status
			: "needs_input";

	const sourceMaterialsStatus =
		rawAnswers.sourceMaterialsStatus === "complete" ||
		rawAnswers.sourceMaterialsStatus === "partial" ||
		rawAnswers.sourceMaterialsStatus === "none"
			? rawAnswers.sourceMaterialsStatus
			: null;

	const sourcePolicy =
		rawAnswers.sourcePolicy === "use_provided_only" ||
		rawAnswers.sourcePolicy === "allow_conservative_skeleton"
			? rawAnswers.sourcePolicy
			: "allow_conservative_skeleton";

	const diceRoller =
		rawAnswers.diceRoller === "player" || rawAnswers.diceRoller === "bardo"
			? rawAnswers.diceRoller
			: null;

	const warnings = Array.isArray(record.warnings)
		? record.warnings.filter((entry) => typeof entry === "string")
		: [];

	const evidenceSummary = Array.isArray(record.evidenceSummary)
		? record.evidenceSummary.filter((entry) => typeof entry === "string")
		: [];

	return {
		revision:
			typeof record.revision === "number" &&
			Number.isFinite(record.revision) &&
			record.revision >= 0
				? Math.floor(record.revision)
				: 0,
		status,
		pendingAction: toTrimmedString(record.pendingAction),
		answers: {
			ttrpgSystem: toTrimmedString(rawAnswers.ttrpgSystem),
			systemUrl: toTrimmedString(rawAnswers.systemUrl),
			sourceMaterialsStatus,
			diceRoller,
			playerCount: toNullablePositiveInteger(rawAnswers.playerCount),
			sourcePolicy,
			additionalContext: toTrimmedString(rawAnswers.additionalContext),
			materialsConfirmation: toTrimmedString(rawAnswers.materialsConfirmation),
		},
		warnings,
		evidenceSummary,
		updatedAtISO: toTrimmedString(record.updatedAtISO),
		completedAtISO: toTrimmedString(record.completedAtISO),
	};
}

function normalizeEvidenceItem(raw: unknown): EvidenceItem | null {
	if (typeof raw !== "object" || raw === null) {
		return null;
	}
	const record = raw as Record<string, unknown>;
	const evidencePath = toTrimmedString(record.path);
	if (!evidencePath) {
		return null;
	}
	const score =
		typeof record.score === "number" && Number.isFinite(record.score)
			? Math.floor(record.score)
			: 0;
	const confidence = toConfidence(score);
	return {
		path: evidencePath,
		score,
		confidence,
	};
}

function normalizeEvidenceByCategory(raw: unknown): EvidenceByCategory {
	if (typeof raw !== "object" || raw === null) {
		return emptyEvidenceByCategory();
	}
	const record = raw as Record<string, unknown>;
	const categories = emptyEvidenceByCategory();
	for (const key of Object.keys(categories) as Array<
		keyof EvidenceByCategory
	>) {
		const entries = Array.isArray(record[key]) ? record[key] : [];
		categories[key] = entries
			.map((entry) => normalizeEvidenceItem(entry))
			.filter((entry): entry is EvidenceItem => entry !== null);
	}
	return categories;
}

function normalizeScanCache(raw: unknown): ScanCacheState {
	if (typeof raw !== "object" || raw === null) {
		return defaultScanCacheState();
	}
	const record = raw as Record<string, unknown>;
	const files = Array.isArray(record.files) ? record.files : [];
	const entries: ScanCacheEntry[] = files
		.map((entry) => {
			if (typeof entry !== "object" || entry === null) {
				return null;
			}
			const row = entry as Record<string, unknown>;
			const evidencePath = toTrimmedString(row.path);
			const size =
				typeof row.size === "number" &&
				Number.isFinite(row.size) &&
				row.size >= 0
					? Math.floor(row.size)
					: null;
			const mtimeMs =
				typeof row.mtimeMs === "number" &&
				Number.isFinite(row.mtimeMs) &&
				row.mtimeMs >= 0
					? Math.floor(row.mtimeMs)
					: null;
			if (!evidencePath || size === null || mtimeMs === null) {
				return null;
			}
			return {
				path: evidencePath,
				size,
				mtimeMs,
				evidence: normalizeEvidenceByCategory(row.evidence),
			};
		})
		.filter((entry): entry is ScanCacheEntry => entry !== null);

	return {
		version:
			typeof record.version === "number" &&
			Number.isFinite(record.version) &&
			record.version > 0
				? Math.floor(record.version)
				: SCAN_CACHE_VERSION,
		updatedAtISO: toTrimmedString(record.updatedAtISO),
		files: entries.sort((a, b) => a.path.localeCompare(b.path)),
	};
}

async function readSetupState(paths: InitPaths): Promise<SetupState> {
	const raw = await readTextIfExists(paths.setupStatePath);
	if (raw === null) {
		return defaultSetupState();
	}
	const parsed = parseMarkdown(raw);
	const data = parseJsonObject(parsed.content.trim());
	return normalizeSetupState(data);
}

async function writeSetupState(
	paths: InitPaths,
	state: SetupState,
): Promise<void> {
	await writeTextAtomic(
		paths.setupStatePath,
		renderMarkdown(
			{
				title: "Setup State",
				description:
					"Revisioned guided setup state used for conflict-safe onboarding.",
			},
			JSON.stringify(state, null, 2),
		),
	);
}

async function readScanCache(paths: InitPaths): Promise<{
	state: ScanCacheState;
	persisted: boolean;
}> {
	const raw = await readTextIfExists(paths.scanCachePath);
	if (raw === null) {
		return {
			state: defaultScanCacheState(),
			persisted: false,
		};
	}
	const parsed = parseMarkdown(raw);
	const data = parseJsonObject(parsed.content.trim());
	return {
		state: normalizeScanCache(data),
		persisted: true,
	};
}

async function writeScanCache(
	paths: InitPaths,
	state: ScanCacheState,
): Promise<void> {
	await writeTextAtomic(
		paths.scanCachePath,
		renderMarkdown(
			{
				title: "Materials Scan Cache",
				description:
					"Incremental cache for source material evidence classification.",
			},
			JSON.stringify(state, null, 2),
		),
	);
}

function scanCacheSignature(state: ScanCacheState): string {
	return JSON.stringify(
		state.files
			.map((entry) => ({
				path: entry.path,
				size: entry.size,
				mtimeMs: entry.mtimeMs,
				evidence: entry.evidence,
			}))
			.sort((a, b) => a.path.localeCompare(b.path)),
	);
}

function compareIso(a: string | null, b: string): boolean {
	if (!a) {
		return false;
	}
	const left = new Date(a).getTime();
	const right = new Date(b).getTime();
	if (!Number.isFinite(left) || !Number.isFinite(right)) {
		return false;
	}
	return left < right;
}

async function acquireSetupLock(
	paths: InitPaths,
	nowIso: string,
): Promise<boolean> {
	await ensureParentDirectoryExists(paths.setupLockPath);
	const expiresAtISO = new Date(
		new Date(nowIso).getTime() + LOCK_TTL_MS,
	).toISOString();
	const payload = JSON.stringify(
		{
			createdAtISO: nowIso,
			expiresAtISO,
		},
		null,
		2,
	);

	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const handle = await open(paths.setupLockPath, "wx");
			await handle.writeFile(payload, "utf8");
			await handle.close();
			return true;
		} catch (error) {
			if (
				typeof error === "object" &&
				error !== null &&
				"code" in error &&
				error.code === "EEXIST"
			) {
				const existingRaw = await readTextIfExists(paths.setupLockPath);
				if (!existingRaw) {
					continue;
				}
				try {
					const parsed = JSON.parse(existingRaw) as { expiresAtISO?: unknown };
					const expires =
						typeof parsed.expiresAtISO === "string"
							? parsed.expiresAtISO
							: null;
					if (compareIso(expires, nowIso)) {
						await rm(paths.setupLockPath, { force: true });
						continue;
					}
				} catch {
					await rm(paths.setupLockPath, { force: true });
					continue;
				}
				return false;
			}
			throw error;
		}
	}

	return false;
}

async function releaseSetupLock(paths: InitPaths): Promise<void> {
	await rm(paths.setupLockPath, { force: true });
}

async function ensureSourceDirectories(bardoRoot: string): Promise<void> {
	const sourceDirectories = [
		"rules/sources/system",
		"rules/sources/rulebook",
		"rules/sources/character-sheets",
		"rules/sources/bestiary",
		"rules/sources/expansions",
		"rules/sources/homebrew",
	];
	for (const relative of sourceDirectories) {
		await mkdir(path.join(bardoRoot, relative), { recursive: true });
	}
}

async function ensureCoreFiles(
	paths: InitPaths,
	nowIso: string,
): Promise<void> {
	const settingsRaw = await readTextIfExists(paths.settingsPath);
	if (
		settingsRaw === null ||
		parseJsonObject(parseMarkdown(settingsRaw).content) === null
	) {
		await writeTextAtomic(
			paths.settingsPath,
			renderMarkdown(
				{
					title: "Campaign Settings",
					description: "Campaign setup settings and preferences.",
				},
				JSON.stringify({ updatedAtISO: nowIso }, null, 2),
			),
		);
	}

	const stateRaw = await readTextIfExists(paths.statePath);
	if (
		stateRaw === null ||
		parseJsonObject(parseMarkdown(stateRaw).content) === null
	) {
		await writeTextAtomic(
			paths.statePath,
			renderMarkdown(
				{
					title: "Campaign State",
					description: "Current campaign state and memory snapshot.",
				},
				JSON.stringify({}, null, 2),
			),
		);
	}

	const historyRaw = await readTextIfExists(paths.historyPath);
	if (historyRaw === null) {
		await writeTextAtomic(
			paths.historyPath,
			renderMarkdown(
				{
					title: "Campaign History",
					description: "Chronological campaign action history log.",
				},
				"",
			),
		);
	}
}

function toConfidence(score: number): EvidenceConfidence {
	if (score >= 4) return "high";
	if (score >= 2) return "medium";
	return "low";
}

function upsertEvidence(
	bucket: EvidenceItem[],
	entry: EvidenceItem,
): EvidenceItem[] {
	const existingIndex = bucket.findIndex((item) => item.path === entry.path);
	if (existingIndex < 0) {
		return [...bucket, entry];
	}
	const existing = bucket[existingIndex];
	if (!existing || existing.score >= entry.score) {
		return bucket;
	}
	const next = [...bucket];
	next[existingIndex] = entry;
	return next;
}

function categorizeEvidence(
	relativePath: string,
	content: string,
): EvidenceByCategory {
	const seed: EvidenceByCategory = {
		system: [],
		rulebook: [],
		"character-sheets": [],
		bestiary: [],
		expansions: [],
		homebrew: [],
	};

	const lowerPath = relativePath.toLowerCase();
	const lowerContent = content.toLowerCase();
	const checks: Array<{
		category: keyof EvidenceByCategory;
		pathTokens: string[];
		textTokens: string[];
	}> = [
		{
			category: "system",
			pathTokens: ["system", "ruleset"],
			textTokens: ["system", "ruleset", "edition"],
		},
		{
			category: "rulebook",
			pathTokens: ["rulebook", "core-rules", "rules"],
			textTokens: ["rulebook", "core rules", "phb", "gm guide"],
		},
		{
			category: "character-sheets",
			pathTokens: ["character-sheet", "character_sheets", "party"],
			textTokens: ["character sheet", "ability score", "class", "level"],
		},
		{
			category: "bestiary",
			pathTokens: ["bestiary", "monsters", "creatures"],
			textTokens: ["bestiary", "monster", "creature", "stat block"],
		},
		{
			category: "expansions",
			pathTokens: ["expansion", "supplement", "module"],
			textTokens: ["expansion", "supplement", "adventure path"],
		},
		{
			category: "homebrew",
			pathTokens: ["homebrew", "custom", "house-rules"],
			textTokens: ["homebrew", "house rule", "custom class"],
		},
	];

	for (const check of checks) {
		let score = 0;
		if (lowerPath.includes(`rules/sources/${check.category}/`)) {
			score += 3;
		}
		if (check.pathTokens.some((token) => lowerPath.includes(token))) {
			score += 2;
		}
		if (check.textTokens.some((token) => lowerContent.includes(token))) {
			score += 1;
		}
		if (score < 1) {
			continue;
		}
		const entry = {
			path: relativePath,
			score,
			confidence: toConfidence(score),
		};
		seed[check.category] = upsertEvidence(seed[check.category], entry);
	}

	return seed;
}

function mergeEvidence(
	target: EvidenceByCategory,
	source: EvidenceByCategory,
): EvidenceByCategory {
	const next: EvidenceByCategory = {
		system: [...target.system],
		rulebook: [...target.rulebook],
		"character-sheets": [...target["character-sheets"]],
		bestiary: [...target.bestiary],
		expansions: [...target.expansions],
		homebrew: [...target.homebrew],
	};
	for (const key of Object.keys(next) as Array<keyof EvidenceByCategory>) {
		for (const entry of source[key]) {
			next[key] = upsertEvidence(next[key], entry);
		}
	}
	return next;
}

async function detectMaterialEvidence(input: {
	bardoRoot: string;
	paths: InitPaths;
	nowIso: string;
}): Promise<{
	byCategory: EvidenceByCategory;
	summary: string[];
}> {
	const byCategory = emptyEvidenceByCategory();
	const scanCache = await readScanCache(input.paths);
	const previousByPath = new Map(
		scanCache.state.files.map((entry) => [entry.path, entry]),
	);
	const nextCacheEntries: ScanCacheEntry[] = [];
	const queue = [input.bardoRoot];
	let scanned = 0;
	let cacheHits = 0;
	let cacheMisses = 0;

	while (queue.length > 0 && scanned < MAX_EVIDENCE_FILES) {
		const current = queue.shift();
		if (!current) break;
		let entries: Dirent<string>[] = [];
		try {
			entries = await readdir(current, {
				withFileTypes: true,
				encoding: "utf8",
			});
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (scanned >= MAX_EVIDENCE_FILES) {
				break;
			}
			const fullPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				if (SKIP_SCAN_DIRECTORIES.has(entry.name)) {
					continue;
				}
				queue.push(fullPath);
				continue;
			}
			if (!entry.isFile()) {
				continue;
			}
			scanned += 1;
			const relative = path
				.relative(input.bardoRoot, fullPath)
				.replaceAll("\\", "/");

			let currentStat: Awaited<ReturnType<typeof stat>> | null = null;
			try {
				currentStat = await stat(fullPath);
			} catch {
				continue;
			}
			if (!currentStat.isFile()) {
				continue;
			}

			const normalizedMtimeMs = Math.floor(currentStat.mtimeMs);
			const cached = previousByPath.get(relative);
			let evidence: EvidenceByCategory;

			if (
				cached &&
				cached.size === currentStat.size &&
				cached.mtimeMs === normalizedMtimeMs
			) {
				evidence = cached.evidence;
				cacheHits += 1;
			} else {
				const extension = path.extname(entry.name).toLowerCase();
				let content = "";
				if (TEXT_EVIDENCE_EXTENSIONS.has(extension)) {
					const raw = await readTextIfExists(fullPath);
					content = raw ? raw.slice(0, 4_000) : "";
				}
				evidence = categorizeEvidence(relative, content);
				cacheMisses += 1;
			}

			nextCacheEntries.push({
				path: relative,
				size: currentStat.size,
				mtimeMs: normalizedMtimeMs,
				evidence,
			});
			const merged = mergeEvidence(byCategory, evidence);
			byCategory.system = merged.system;
			byCategory.rulebook = merged.rulebook;
			byCategory["character-sheets"] = merged["character-sheets"];
			byCategory.bestiary = merged.bestiary;
			byCategory.expansions = merged.expansions;
			byCategory.homebrew = merged.homebrew;
		}
	}

	nextCacheEntries.sort((a, b) => a.path.localeCompare(b.path));
	const nextCache: ScanCacheState = {
		version: SCAN_CACHE_VERSION,
		updatedAtISO: scanCache.state.updatedAtISO,
		files: nextCacheEntries,
	};
	const didScanCacheChange =
		!scanCache.persisted ||
		scanCache.state.version !== SCAN_CACHE_VERSION ||
		scanCacheSignature(scanCache.state) !== scanCacheSignature(nextCache);
	if (didScanCacheChange) {
		nextCache.updatedAtISO = input.nowIso;
		await writeScanCache(input.paths, nextCache);
	}

	recordSetupScanCacheMetric({
		outcome: "hit",
		count: cacheHits,
	});
	recordSetupScanCacheMetric({
		outcome: "miss",
		count: cacheMisses,
	});

	const summary = (
		Object.keys(byCategory) as Array<keyof EvidenceByCategory>
	).map((category) => {
		const entries = byCategory[category];
		const high = entries.filter((entry) => entry.confidence === "high").length;
		const medium = entries.filter(
			(entry) => entry.confidence === "medium",
		).length;
		const low = entries.filter((entry) => entry.confidence === "low").length;
		return `${category}: ${entries.length} candidate(s) [high=${high}, medium=${medium}, low=${low}]`;
	});

	return { byCategory, summary };
}

async function writeMaterialsIndex(
	paths: InitPaths,
	nowIso: string,
	setupState: SetupState,
	evidence: EvidenceByCategory,
): Promise<void> {
	await writeTextAtomic(
		paths.materialsIndexPath,
		renderMarkdown(
			{
				title: "Materials Index",
				description:
					"Detected and confirmed TTRPG materials used by guided setup.",
			},
			JSON.stringify(
				{
					updatedAtISO: nowIso,
					ttrpgSystem: setupState.answers.ttrpgSystem,
					systemUrl: setupState.answers.systemUrl,
					sourceMaterialsStatus: setupState.answers.sourceMaterialsStatus,
					sourcePolicy: setupState.answers.sourcePolicy,
					materialsConfirmation: setupState.answers.materialsConfirmation,
					detected: evidence,
				},
				null,
				2,
			),
		),
	);
}

async function persistSetupToSettings(
	paths: InitPaths,
	setupState: SetupState,
	nowIso: string,
): Promise<void> {
	const settings = await readJsonMarkdown(paths.settingsPath);
	const existingData = settings.data;
	const nextData = {
		...existingData,
		diceRoller:
			setupState.answers.diceRoller ?? existingData.diceRoller ?? null,
		ttrpgSystem: setupState.answers.ttrpgSystem ?? null,
		setup: {
			ttrpgSystem: setupState.answers.ttrpgSystem,
			systemUrl: setupState.answers.systemUrl,
			sourceMaterialsStatus: setupState.answers.sourceMaterialsStatus,
			diceRoller: setupState.answers.diceRoller,
			playerCount: setupState.answers.playerCount,
			sourcePolicy: setupState.answers.sourcePolicy,
			additionalContext: setupState.answers.additionalContext,
			materialsConfirmation: setupState.answers.materialsConfirmation,
			warnings: setupState.warnings,
			evidenceSummary: setupState.evidenceSummary,
			revision: setupState.revision,
			status: setupState.status,
			updatedAtISO: nowIso,
		},
		updatedAtISO: nowIso,
	};
	await writeTextAtomic(
		paths.settingsPath,
		renderMarkdown(
			{
				title: settings.frontmatter.title?.trim() || "Campaign Settings",
				description:
					settings.frontmatter.description?.trim() ||
					"Campaign setup settings and preferences.",
			},
			JSON.stringify(nextData, null, 2),
		),
	);
}

function upsertWarning(warnings: string[], warning: string): string[] {
	return warnings.includes(warning) ? warnings : [...warnings, warning];
}

function mergeSetupAnswers(
	state: SetupState,
	answers: SetupAnswers | undefined,
): { state: SetupState; changed: boolean } {
	if (!answers) {
		return { state, changed: false };
	}

	let changed = false;
	const next: SetupState = {
		...state,
		answers: {
			...state.answers,
		},
		warnings: [...state.warnings],
	};

	const ttrpgSystem = toTrimmedString(answers.ttrpgSystem);
	if (ttrpgSystem && ttrpgSystem !== state.answers.ttrpgSystem) {
		next.answers.ttrpgSystem = ttrpgSystem;
		changed = true;
	}
	const systemUrl = toTrimmedString(answers.systemUrl);
	if (systemUrl && systemUrl !== state.answers.systemUrl) {
		next.answers.systemUrl = systemUrl;
		changed = true;
	}
	if (
		answers.sourceMaterialsStatus &&
		answers.sourceMaterialsStatus !== state.answers.sourceMaterialsStatus
	) {
		next.answers.sourceMaterialsStatus = answers.sourceMaterialsStatus;
		changed = true;
		if (answers.sourceMaterialsStatus !== "complete") {
			next.warnings = upsertWarning(
				next.warnings,
				"Source materials are incomplete. Setup proceeds with explicit assumptions.",
			);
		}
	}
	if (answers.diceRoller && answers.diceRoller !== state.answers.diceRoller) {
		next.answers.diceRoller = answers.diceRoller;
		changed = true;
	}
	if (
		typeof answers.playerCount === "number" &&
		Number.isInteger(answers.playerCount) &&
		answers.playerCount >= 1 &&
		answers.playerCount <= 20 &&
		answers.playerCount !== state.answers.playerCount
	) {
		next.answers.playerCount = answers.playerCount;
		changed = true;
	}
	if (
		answers.sourcePolicy &&
		answers.sourcePolicy !== state.answers.sourcePolicy
	) {
		next.answers.sourcePolicy = answers.sourcePolicy;
		changed = true;
	}
	const additionalContext = toTrimmedString(answers.additionalContext);
	if (
		additionalContext &&
		additionalContext !== state.answers.additionalContext
	) {
		next.answers.additionalContext = additionalContext;
		changed = true;
	}
	const materialsConfirmation = toTrimmedString(answers.materialsConfirmation);
	if (
		materialsConfirmation &&
		materialsConfirmation !== state.answers.materialsConfirmation
	) {
		next.answers.materialsConfirmation = materialsConfirmation;
		changed = true;
	}

	return { state: next, changed };
}

function requiredAnswersCompleted(answers: SetupState["answers"]): boolean {
	return REQUIRED_SETUP_KEYS.every((key) => answers[key] !== null);
}

function setupQuestionForState(
	state: SetupState,
	evidenceSummary: string[],
): { key: string; question: string } | null {
	if (!state.answers.ttrpgSystem) {
		return {
			key: "ttrpgSystem",
			question:
				"What ttrpg system are we playing? If possible, share a rulebook URL or file path so I can align mechanics accurately.",
		};
	}

	if (!state.answers.sourceMaterialsStatus) {
		const evidenceLine =
			evidenceSummary.length > 0
				? ` Detected materials: ${evidenceSummary.join("; ")}.`
				: "";
		return {
			key: "sourceMaterialsStatus",
			question: `Do you already have core materials (rulebook, character sheets, bestiary, expansions) available? Reply with \`complete\`, \`partial\`, or \`none\`.${evidenceLine}`,
		};
	}

	if (!state.answers.diceRoller) {
		return {
			key: "diceRoller",
			question:
				"Who should roll party character dice for this campaign: `player` or `bardo`?",
		};
	}

	if (!state.answers.playerCount) {
		return {
			key: "playerCount",
			question: "How many players are in the party?",
		};
	}

	return null;
}

function setupProgress(answers: SetupState["answers"]): number {
	let answered = 0;
	for (const key of REQUIRED_SETUP_KEYS) {
		if (answers[key] !== null) {
			answered += 1;
		}
	}
	return answered;
}

function flowResult(args: {
	status: SetupStatus;
	message: string;
	state: SetupState;
	questionKey: string | null;
	question: string | null;
	actionToExecute: string | null;
	integrity: CoreIntegrityResult;
	conflictReason?: string | null;
	bootstrap: Awaited<ReturnType<typeof runBootstrapStep>>;
}): GuidedSetupFlowResult {
	return {
		status: args.status,
		message: args.message,
		revision: args.state.revision,
		questionKey: args.questionKey,
		question: args.question,
		progressAnswered:
			args.bootstrap.answeredCount + setupProgress(args.state.answers),
		progressTotal: args.bootstrap.totalQuestions + REQUIRED_SETUP_KEYS.length,
		pendingAction: args.state.pendingAction,
		actionToExecute: args.actionToExecute,
		warnings: [...args.state.warnings],
		evidenceSummary: [...args.state.evidenceSummary],
		conflict: {
			detected: Boolean(args.conflictReason),
			reason: args.conflictReason ?? null,
		},
		integrity: args.integrity,
		bootstrap: {
			complete: args.bootstrap.complete,
			alreadyInitialized: args.bootstrap.alreadyInitialized,
			pendingQuestionKey: args.bootstrap.pendingQuestionKey,
			nextPrompt: args.bootstrap.nextPrompt,
			includeValues: args.bootstrap.includeValues,
			answeredCount: args.bootstrap.answeredCount,
			totalQuestions: args.bootstrap.totalQuestions,
			bootstrapPath: args.bootstrap.bootstrapPath,
			identityPath: args.bootstrap.identityPath,
			userPath: args.bootstrap.userPath,
			soulPath: args.bootstrap.soulPath,
		},
		answers: {
			...args.state.answers,
		},
	};
}

export async function runGuidedSetupFlow(input: {
	campaignBasePath: string;
	nowIso: string;
	bootstrapAnswers?: Record<string, string>;
	setupAnswers?: SetupAnswers;
	expectedRevision?: number;
	incomingAction?: string;
}): Promise<GuidedSetupFlowResult> {
	const startedAtMs = Date.now();
	const finalize = (result: GuidedSetupFlowResult): GuidedSetupFlowResult => {
		recordSetupFlowMetric({
			status: result.status,
			durationMs: Math.max(0, Date.now() - startedAtMs),
		});
		return result;
	};

	try {
		const bardoRoot = resolveBardoRoot(input.campaignBasePath);
		const paths = resolveInitPaths(bardoRoot);

		const directorySetup = await ensureInitDirectories(bardoRoot);
		if (directorySetup.failureMessage) {
			const defaultState = defaultSetupState();
			const bootstrap = await runBootstrapStep({
				paths,
				nowIso: input.nowIso,
				bootstrapAnswers: input.bootstrapAnswers,
			});
			return finalize(
				flowResult({
					status: "error",
					message: directorySetup.failureMessage,
					state: defaultState,
					questionKey: null,
					question: null,
					actionToExecute: null,
					integrity: {
						ok: false,
						missingPaths: [],
						invalidPaths: [],
					},
					bootstrap,
				}),
			);
		}

		await ensureContextRepositoryScaffold(bardoRoot);
		await ensureSourceDirectories(bardoRoot);

		const integrityBefore = await validateCoreIntegrity(bardoRoot);
		if (!integrityBefore.ok) {
			await ensureCoreFiles(paths, input.nowIso);
		}
		const integrityAfter = await validateCoreIntegrity(bardoRoot);

		const lockAcquired = await acquireSetupLock(paths, input.nowIso);
		if (!lockAcquired) {
			const state = await readSetupState(paths);
			const bootstrap = await runBootstrapStep({
				paths,
				nowIso: input.nowIso,
			});
			return finalize(
				flowResult({
					status: "locked",
					message:
						"Setup is currently being updated by another request. Retry shortly.",
					state,
					questionKey: bootstrap.pendingQuestionKey,
					question: bootstrap.nextPrompt,
					actionToExecute: null,
					integrity: integrityAfter,
					bootstrap,
				}),
			);
		}

		try {
			let state = await readSetupState(paths);
			let changed = false;

			if (!integrityBefore.ok) {
				state = {
					...defaultSetupState(),
					pendingAction: state.pendingAction,
					warnings: upsertWarning(
						state.warnings,
						"Core setup artifacts were missing or invalid and were regenerated.",
					),
					revision: state.revision,
				};
				changed = true;
			}

			if (
				typeof input.expectedRevision === "number" &&
				input.expectedRevision !== state.revision
			) {
				const bootstrap = await runBootstrapStep({
					paths,
					nowIso: input.nowIso,
				});
				const question = setupQuestionForState(state, state.evidenceSummary);
				return finalize(
					flowResult({
						status: "needs_input",
						message:
							"Setup revision conflict detected. Refresh and retry with latest revision.",
						state,
						questionKey: bootstrap.complete
							? (question?.key ?? null)
							: bootstrap.pendingQuestionKey,
						question: bootstrap.complete
							? (question?.question ?? null)
							: bootstrap.nextPrompt,
						actionToExecute: null,
						integrity: integrityAfter,
						conflictReason: `Expected revision ${input.expectedRevision}, current revision is ${state.revision}.`,
						bootstrap,
					}),
				);
			}

			if (input.incomingAction) {
				if (
					state.pendingAction === null ||
					(!input.setupAnswers && !input.bootstrapAnswers)
				) {
					if (state.pendingAction !== input.incomingAction) {
						state.pendingAction = input.incomingAction;
						changed = true;
					}
				}
			}

			const bootstrap = await runBootstrapStep({
				paths,
				nowIso: input.nowIso,
				bootstrapAnswers: input.bootstrapAnswers,
			});

			const { byCategory, summary } = await detectMaterialEvidence({
				bardoRoot,
				paths,
				nowIso: input.nowIso,
			});
			if (JSON.stringify(summary) !== JSON.stringify(state.evidenceSummary)) {
				state.evidenceSummary = summary;
				changed = true;
			}

			if (!bootstrap.complete) {
				if (changed || input.bootstrapAnswers || input.setupAnswers) {
					state.revision += 1;
					state.updatedAtISO = input.nowIso;
					await writeSetupState(paths, state);
					await persistSetupToSettings(paths, state, input.nowIso);
					await writeMaterialsIndex(paths, input.nowIso, state, byCategory);
				}

				return finalize(
					flowResult({
						status: "needs_input",
						message:
							"Setup is waiting for bootstrap answers. Continue one question at a time.",
						state,
						questionKey: bootstrap.pendingQuestionKey,
						question: bootstrap.nextPrompt,
						actionToExecute: null,
						integrity: integrityAfter,
						bootstrap,
					}),
				);
			}

			const merged = mergeSetupAnswers(state, input.setupAnswers);
			state = merged.state;
			changed = changed || merged.changed;
			state.status = "needs_input";

			const question = setupQuestionForState(state, state.evidenceSummary);
			if (question) {
				if (changed || input.setupAnswers || input.bootstrapAnswers) {
					state.revision += 1;
					state.updatedAtISO = input.nowIso;
					await writeSetupState(paths, state);
					await persistSetupToSettings(paths, state, input.nowIso);
					await writeMaterialsIndex(paths, input.nowIso, state, byCategory);
				}
				return finalize(
					flowResult({
						status: "needs_input",
						message:
							"Setup is partially complete. Answer the next question to continue.",
						state,
						questionKey: question.key,
						question: question.question,
						actionToExecute: null,
						integrity: integrityAfter,
						bootstrap,
					}),
				);
			}

			if (requiredAnswersCompleted(state.answers)) {
				state.status = "complete";
				state.completedAtISO = input.nowIso;
			}

			const actionToExecute =
				state.pendingAction ?? input.incomingAction ?? null;
			if (state.pendingAction !== null) {
				state.pendingAction = null;
				changed = true;
			}

			if (changed || input.setupAnswers || input.bootstrapAnswers) {
				state.revision += 1;
				state.updatedAtISO = input.nowIso;
				await writeSetupState(paths, state);
				await persistSetupToSettings(paths, state, input.nowIso);
				await writeMaterialsIndex(paths, input.nowIso, state, byCategory);
			}

			return finalize(
				flowResult({
					status: "complete",
					message:
						"Setup is complete. Gameplay can continue with the queued player action.",
					state,
					questionKey: null,
					question: null,
					actionToExecute,
					integrity: integrityAfter,
					bootstrap,
				}),
			);
		} finally {
			await releaseSetupLock(paths);
		}
	} catch (error) {
		recordSetupFlowMetric({
			status: "error",
			durationMs: Math.max(0, Date.now() - startedAtMs),
		});
		throw error;
	}
}
