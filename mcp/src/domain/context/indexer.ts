import { Database } from "bun:sqlite";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { withKeyedLock } from "../../infra/concurrency/keyed-lock";
import {
	ensureParentDirectoryExists,
	readTextIfExists,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";
import { parseMarkdown } from "../markdown/markdown";

type IndexedDoc = {
	relativePath: string;
	sourceDir: string;
	title: string;
	body: string;
	bodyChars: number;
	updatedAtISO: string;
};

const INDEX_SCHEMA = `
CREATE TABLE IF NOT EXISTS docs (
  relative_path TEXT PRIMARY KEY,
  source_dir TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  body_chars INTEGER NOT NULL,
  updated_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_docs_source_dir ON docs(source_dir);
CREATE INDEX IF NOT EXISTS idx_docs_updated_at_iso ON docs(updated_at_iso);

CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  relative_path UNINDEXED,
  title,
  body
);
`;

function contextIndexPath(bardoRoot: string): string {
	return resolvePathInsideRoot(bardoRoot, "context/index.sqlite");
}

function contextIndexManifestPath(bardoRoot: string): string {
	return resolvePathInsideRoot(
		bardoRoot,
		"_settings/context-index-manifest.json",
	);
}

type ContextIndexManifest = {
	version: 2;
	docsIndexed: number;
	updatedAtISO: string;
	docs: Record<
		string,
		{
			size: number;
			mtimeMs: number;
		}
	>;
};

function topLevelDir(relativePath: string): string {
	const normalized = relativePath.replaceAll("\\", "/");
	const top = normalized.split("/")[0];
	return top || "unknown";
}

async function listMarkdownFilesRecursive(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name.startsWith(".")) {
				continue;
			}
			const nested = await listMarkdownFilesRecursive(fullPath);
			files.push(...nested);
			continue;
		}

		if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
			files.push(fullPath);
		}
	}

	return files;
}

function isIndexableRelativePath(relativePath: string): boolean {
	return !(
		relativePath.startsWith("context/") ||
		relativePath.startsWith(".git/") ||
		relativePath === "AGENTS.md" ||
		relativePath === "BOOTSTRAP.md"
	);
}

function normalizeDoc({
	bardoRoot,
	filePath,
	raw,
	nowIso,
}: {
	bardoRoot: string;
	filePath: string;
	raw: string;
	nowIso: string;
}): IndexedDoc {
	const parsed = parseMarkdown(raw);
	const relativePath = path.relative(bardoRoot, filePath).replaceAll("\\", "/");
	const sourceDir = topLevelDir(relativePath);
	const body = parsed.content.trim();
	const title = parsed.frontmatter.title?.trim() || path.basename(relativePath);

	return {
		relativePath,
		sourceDir,
		title,
		body,
		bodyChars: body.length,
		updatedAtISO: nowIso,
	};
}

export async function rebuildContextIndex(bardoRoot: string): Promise<{
	indexPath: string;
	docsIndexed: number;
}> {
	const indexPath = contextIndexPath(bardoRoot);
	await ensureParentDirectoryExists(indexPath);
	const db = new Database(indexPath);

	try {
		db.exec(INDEX_SCHEMA);
		db.exec("DELETE FROM docs");
		db.exec("DELETE FROM docs_fts");

		const insertStmt = db.prepare(
			`INSERT INTO docs (
				relative_path,
				source_dir,
				title,
				body,
				body_chars,
				updated_at_iso
			) VALUES (?, ?, ?, ?, ?, ?)`,
		);
		const insertFtsStmt = db.prepare(
			`INSERT INTO docs_fts (
				relative_path,
				title,
				body
			) VALUES (?, ?, ?)`,
		);

		const markdownPaths = await listMarkdownFilesRecursive(bardoRoot);
		const nowIso = new Date().toISOString();
		let docsIndexed = 0;

		for (const filePath of markdownPaths) {
			const relativePath = path
				.relative(bardoRoot, filePath)
				.replaceAll("\\", "/");
			if (!isIndexableRelativePath(relativePath)) {
				continue;
			}

			const raw = await readTextIfExists(filePath);
			if (raw === null) {
				continue;
			}

			const doc = normalizeDoc({ bardoRoot, filePath, raw, nowIso });
			insertStmt.run(
				doc.relativePath,
				doc.sourceDir,
				doc.title,
				doc.body,
				doc.bodyChars,
				doc.updatedAtISO,
			);
			insertFtsStmt.run(doc.relativePath, doc.title, doc.body);
			docsIndexed += 1;
		}

		return { indexPath, docsIndexed };
	} finally {
		db.close();
	}
}

function parseManifest(raw: string | null): ContextIndexManifest | null {
	if (!raw || raw.trim().length === 0) {
		return null;
	}
	try {
		const parsed = JSON.parse(raw) as Partial<ContextIndexManifest>;
		if (
			parsed.version !== 2 ||
			typeof parsed.docsIndexed !== "number" ||
			typeof parsed.updatedAtISO !== "string" ||
			!parsed.docs ||
			typeof parsed.docs !== "object"
		) {
			return null;
		}
		for (const value of Object.values(parsed.docs)) {
			if (
				!value ||
				typeof value !== "object" ||
				typeof value.size !== "number" ||
				typeof value.mtimeMs !== "number"
			) {
				return null;
			}
		}
		return parsed as ContextIndexManifest;
	} catch {
		return null;
	}
}

async function hasIndexFile(indexPath: string): Promise<boolean> {
	try {
		const file = await stat(indexPath);
		return file.isFile();
	} catch {
		return false;
	}
}

async function scanMarkdownCorpus(bardoRoot: string): Promise<
	Map<
		string,
		{
			filePath: string;
			size: number;
			mtimeMs: number;
		}
	>
> {
	const markdownPaths = await listMarkdownFilesRecursive(bardoRoot);
	const docs = new Map<
		string,
		{
			filePath: string;
			size: number;
			mtimeMs: number;
		}
	>();
	for (const filePath of markdownPaths) {
		const relativePath = path
			.relative(bardoRoot, filePath)
			.replaceAll("\\", "/");
		if (!isIndexableRelativePath(relativePath)) {
			continue;
		}
		const details = await stat(filePath);
		docs.set(relativePath, {
			filePath,
			size: details.size,
			mtimeMs: details.mtimeMs,
		});
	}
	return docs;
}

function diffCorpusAgainstManifest(args: {
	scannedDocs: Map<
		string,
		{
			filePath: string;
			size: number;
			mtimeMs: number;
		}
	>;
	manifest: ContextIndexManifest | null;
}): {
	changed: string[];
	removed: string[];
} {
	if (!args.manifest) {
		return {
			changed: Array.from(args.scannedDocs.keys()),
			removed: [],
		};
	}

	const changed: string[] = [];
	for (const [relativePath, details] of args.scannedDocs.entries()) {
		const previous = args.manifest.docs[relativePath];
		if (
			!previous ||
			previous.size !== details.size ||
			previous.mtimeMs !== details.mtimeMs
		) {
			changed.push(relativePath);
		}
	}
	const removed = Object.keys(args.manifest.docs).filter(
		(relativePath) => !args.scannedDocs.has(relativePath),
	);
	return { changed, removed };
}

async function writeContextIndexManifest(args: {
	bardoRoot: string;
	docsIndexed: number;
	scannedDocs: Map<
		string,
		{
			filePath: string;
			size: number;
			mtimeMs: number;
		}
	>;
}): Promise<void> {
	const manifestPath = contextIndexManifestPath(args.bardoRoot);
	const nextManifest: ContextIndexManifest = {
		version: 2,
		docsIndexed: args.docsIndexed,
		updatedAtISO: new Date().toISOString(),
		docs: Object.fromEntries(
			Array.from(args.scannedDocs.entries()).map(([relativePath, details]) => [
				relativePath,
				{
					size: details.size,
					mtimeMs: details.mtimeMs,
				},
			]),
		),
	};
	await ensureParentDirectoryExists(manifestPath);
	await writeFile(manifestPath, JSON.stringify(nextManifest, null, 2), "utf8");
}

export async function refreshContextIndex(bardoRoot: string): Promise<{
	indexPath: string;
	docsIndexed: number;
	indexRebuilt: boolean;
}> {
	return withKeyedLock(`context-index:${bardoRoot}`, async () => {
		const indexPath = contextIndexPath(bardoRoot);
		const scannedDocs = await scanMarkdownCorpus(bardoRoot);
		const [manifestRaw, indexExists] = await Promise.all([
			readTextIfExists(contextIndexManifestPath(bardoRoot)),
			hasIndexFile(indexPath),
		]);
		const manifest = parseManifest(manifestRaw);
		const delta = diffCorpusAgainstManifest({ scannedDocs, manifest });
		if (
			indexExists &&
			manifest &&
			delta.changed.length === 0 &&
			delta.removed.length === 0
		) {
			return {
				indexPath,
				docsIndexed: manifest.docsIndexed,
				indexRebuilt: false,
			};
		}

		if (!indexExists || !manifest) {
			const rebuilt = await rebuildContextIndex(bardoRoot);
			await writeContextIndexManifest({
				bardoRoot,
				docsIndexed: rebuilt.docsIndexed,
				scannedDocs,
			});
			return {
				indexPath: rebuilt.indexPath,
				docsIndexed: rebuilt.docsIndexed,
				indexRebuilt: true,
			};
		}

		const db = new Database(indexPath);
		try {
			db.exec(INDEX_SCHEMA);
			const deleteDocStmt = db.prepare(
				"DELETE FROM docs WHERE relative_path = ?",
			);
			const deleteFtsStmt = db.prepare(
				"DELETE FROM docs_fts WHERE relative_path = ?",
			);
			const upsertDocStmt = db.prepare(
				`INSERT INTO docs (
					relative_path,
					source_dir,
					title,
					body,
					body_chars,
					updated_at_iso
				) VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT(relative_path) DO UPDATE SET
					source_dir = excluded.source_dir,
					title = excluded.title,
					body = excluded.body,
					body_chars = excluded.body_chars,
					updated_at_iso = excluded.updated_at_iso`,
			);
			const insertFtsStmt = db.prepare(
				`INSERT INTO docs_fts (
					relative_path,
					title,
					body
				) VALUES (?, ?, ?)`,
			);
			const nowIso = new Date().toISOString();

			for (const relativePath of delta.removed) {
				deleteDocStmt.run(relativePath);
				deleteFtsStmt.run(relativePath);
			}

			for (const relativePath of delta.changed) {
				const details = scannedDocs.get(relativePath);
				if (!details) {
					continue;
				}
				const raw = await readTextIfExists(details.filePath);
				if (raw === null) {
					deleteDocStmt.run(relativePath);
					deleteFtsStmt.run(relativePath);
					continue;
				}
				const doc = normalizeDoc({
					bardoRoot,
					filePath: details.filePath,
					raw,
					nowIso,
				});
				upsertDocStmt.run(
					doc.relativePath,
					doc.sourceDir,
					doc.title,
					doc.body,
					doc.bodyChars,
					doc.updatedAtISO,
				);
				deleteFtsStmt.run(doc.relativePath);
				insertFtsStmt.run(doc.relativePath, doc.title, doc.body);
			}
		} finally {
			db.close();
		}

		await writeContextIndexManifest({
			bardoRoot,
			docsIndexed: scannedDocs.size,
			scannedDocs,
		});
		return {
			indexPath,
			docsIndexed: scannedDocs.size,
			indexRebuilt: true,
		};
	});
}

function tokenizeSearchTerms(query: string): string[] {
	const normalized = query
		.toLowerCase()
		.replaceAll(/[^a-z0-9_]+/g, " ")
		.trim();
	if (!normalized) {
		return [];
	}
	return normalized
		.split(/\s+/)
		.map((token) => token.trim())
		.filter((token) => token.length >= 2);
}

function buildFtsQuery(tokens: string[]): string | null {
	if (tokens.length === 0) {
		return null;
	}
	return tokens
		.map((token) => `"${token.replaceAll('"', '""')}"*`)
		.join(" OR ");
}

export function queryContextDocs(args: {
	bardoRoot: string;
	query: string;
	mode: "fast" | "deep";
	focus: "all" | "world" | "entities" | "quests" | "state";
	limit: number;
}): Array<{
	relativePath: string;
	title: string;
	sourceDir: string;
	snippet: string;
	bodyChars: number;
	matchScore: number;
}> {
	const indexPath = contextIndexPath(args.bardoRoot);
	const db = new Database(indexPath, { readonly: true, create: false });

	try {
		const focusDir = args.focus === "all" ? null : args.focus;
		const queryLower = args.query.toLowerCase().trim();
		const tokens = tokenizeSearchTerms(queryLower);
		const ftsQuery = buildFtsQuery(tokens);
		const candidateLimit = Math.max(args.limit * 5, 20);
		const rows = (
			queryLower
				? db
						.prepare(
							`SELECT
							d.relative_path,
							d.title,
							d.source_dir,
							d.body,
							d.body_chars,
							d.updated_at_iso
						FROM docs_fts
						JOIN docs d
							ON d.relative_path = docs_fts.relative_path
						WHERE docs_fts MATCH ?
							AND (? IS NULL OR d.source_dir = ?)
						ORDER BY bm25(docs_fts, 8.0, 1.5)
						LIMIT ?`,
						)
						.all(
							ftsQuery ?? `"${queryLower.replaceAll('"', '""')}"*`,
							focusDir,
							focusDir,
							candidateLimit,
						)
				: db
						.prepare(
							`SELECT
							relative_path,
							title,
							source_dir,
							body,
							body_chars,
							updated_at_iso
						FROM docs
						WHERE (? IS NULL OR source_dir = ?)
						ORDER BY updated_at_iso DESC
						LIMIT ?`,
						)
						.all(focusDir, focusDir, candidateLimit)
		) as Array<{
			relative_path: string;
			title: string;
			source_dir: string;
			body: string;
			body_chars: number;
			updated_at_iso: string;
		}>;

		return rows
			.map((row) => {
				const titleLower = row.title.toLowerCase();
				const bodyLower = row.body.toLowerCase();
				const pathLower = row.relative_path.toLowerCase();
				let matchScore = 0;
				if (!queryLower) {
					matchScore = 1;
				}
				if (queryLower && titleLower.includes(queryLower)) {
					matchScore += 6;
				}
				if (queryLower && bodyLower.includes(queryLower)) {
					matchScore += 4;
				}
				for (const token of tokens) {
					if (titleLower.includes(token)) {
						matchScore += 3;
					}
					if (pathLower.includes(token)) {
						matchScore += 2;
					}
					if (bodyLower.includes(token)) {
						matchScore += 1;
					}
				}
				return {
					relativePath: row.relative_path,
					title: row.title,
					sourceDir: row.source_dir,
					snippet: row.body.slice(0, args.mode === "fast" ? 180 : 360),
					bodyChars: row.body_chars,
					matchScore,
					updatedAtISO: row.updated_at_iso,
				};
			})
			.filter((row) => queryLower.length === 0 || row.matchScore > 0)
			.sort((left, right) => {
				if (right.matchScore !== left.matchScore) {
					return right.matchScore - left.matchScore;
				}
				return right.updatedAtISO.localeCompare(left.updatedAtISO);
			})
			.slice(0, args.limit)
			.map(({ updatedAtISO: _updatedAtISO, ...row }) => row);
	} finally {
		db.close();
	}
}
