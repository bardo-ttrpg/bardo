import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const docsRoot = path.join(packageRoot, "content", "docs");
const manifestPath = path.join(packageRoot, "src", "index.ts");

async function listMdxFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				return listMdxFiles(fullPath);
			}
			return entry.isFile() && entry.name.endsWith(".mdx") ? [fullPath] : [];
		}),
	);
	return files.flat();
}

const manifestSource = await readFile(manifestPath, "utf8");
const manifestSources = Array.from(
	manifestSource.matchAll(/source:\s*"([^"]+)"/g),
	(match) => match[1],
);
const manifestHrefs = Array.from(
	manifestSource.matchAll(/href:\s*"([^"]+)"/g),
	(match) => match[1],
);

if (new Set(manifestHrefs).size !== manifestHrefs.length) {
	throw new Error("Docs manifest contains duplicate href values.");
}

if (new Set(manifestSources).size !== manifestSources.length) {
	throw new Error("Docs manifest contains duplicate source values.");
}

await Promise.all(
	manifestSources.map(async (source) => {
		const fullPath = path.join(packageRoot, source);
		const fileStat = await stat(fullPath).catch(() => null);
		if (!fileStat?.isFile()) {
			throw new Error(`Docs manifest source does not exist: ${source}`);
		}
	}),
);

const actualSources = (await listMdxFiles(docsRoot))
	.map((filePath) =>
		path.relative(packageRoot, filePath).split(path.sep).join("/"),
	)
	.sort();
const listedSources = [...manifestSources].sort();

if (JSON.stringify(actualSources) !== JSON.stringify(listedSources)) {
	throw new Error(
		[
			"Docs manifest must list every MDX docs file.",
			`Actual: ${actualSources.join(", ")}`,
			`Listed: ${listedSources.join(", ")}`,
		].join("\n"),
	);
}
