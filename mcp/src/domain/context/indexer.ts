import { Database } from "bun:sqlite";
import { readdir } from "node:fs/promises";
import path from "node:path";
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
`;

function contextIndexPath(bardoRoot: string): string {
	return resolvePathInsideRoot(bardoRoot, "context/index.sqlite");
}

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

		const markdownPaths = await listMarkdownFilesRecursive(bardoRoot);
		const nowIso = new Date().toISOString();
		let docsIndexed = 0;

		for (const filePath of markdownPaths) {
			const relativePath = path
				.relative(bardoRoot, filePath)
				.replaceAll("\\", "/");
			if (
				relativePath.startsWith("context/") ||
				relativePath.startsWith(".git/") ||
				relativePath === "AGENTS.md" ||
				relativePath === "BOOTSTRAP.md"
			) {
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
			docsIndexed += 1;
		}

		return { indexPath, docsIndexed };
	} finally {
		db.close();
	}
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
		const queryLower = args.query.toLowerCase();
		const searchPattern = `%${queryLower}%`;

		const stmt = db.prepare(
			`SELECT
				relative_path,
				title,
				source_dir,
				body,
				body_chars,
				(
					(CASE WHEN lower(title) LIKE ? THEN 3 ELSE 0 END) +
					(CASE WHEN lower(body) LIKE ? THEN 1 ELSE 0 END)
				) AS match_score
			FROM docs
			WHERE (? IS NULL OR source_dir = ?)
			AND (? = '' OR lower(title) LIKE ? OR lower(body) LIKE ?)
			ORDER BY match_score DESC, updated_at_iso DESC
			LIMIT ?`,
		);

		const rows = stmt.all(
			searchPattern,
			searchPattern,
			focusDir,
			focusDir,
			queryLower,
			searchPattern,
			searchPattern,
			args.limit,
		) as Array<{
			relative_path: string;
			title: string;
			source_dir: string;
			body: string;
			body_chars: number;
			match_score: number;
		}>;

		return rows.map((row) => ({
			relativePath: row.relative_path,
			title: row.title,
			sourceDir: row.source_dir,
			snippet: row.body.slice(0, args.mode === "fast" ? 180 : 360),
			bodyChars: row.body_chars,
			matchScore: row.match_score,
		}));
	} finally {
		db.close();
	}
}
