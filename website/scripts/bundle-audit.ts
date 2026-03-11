import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { auditBundleArtifacts } from "./bundle-audit-lib";

async function collectFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(fullPath)));
			continue;
		}
		files.push(fullPath);
	}
	return files;
}

async function main() {
	const nextDir = join(process.cwd(), ".next");
	const analyzeDir = join(nextDir, "diagnostics", "analyze");
	const legacyAnalyzeDir = join(nextDir, "analyze");
	const chunkDir = join(nextDir, "static", "chunks");

	const analyzeArtifacts = (
		await readdir(analyzeDir).catch(async () => {
			return await readdir(legacyAnalyzeDir).catch(() => []);
		})
	)
		.filter((name) => name.endsWith(".html"))
		.sort();
	const chunkPaths = (await collectFiles(chunkDir)).filter((path) =>
		path.endsWith(".js"),
	);
	const clientChunks = await Promise.all(
		chunkPaths.map(async (path) => {
			return {
				path: relative(nextDir, path).replaceAll("\\", "/"),
				bytes: (await stat(path)).size,
				contents: await readFile(path, "utf8"),
			};
		}),
	);

	const result = auditBundleArtifacts({
		analyzeArtifacts,
		clientChunks,
	});

	console.log(
		`Audited ${result.summary.clientChunkCount} client chunks (${result.summary.totalClientChunkBytes} bytes).`,
	);

	for (const warning of result.warnings) {
		console.warn(`warning: ${warning}`);
	}

	if (result.errors.length > 0) {
		for (const error of result.errors) {
			console.error(`error: ${error}`);
		}
		process.exit(1);
	}
}

await main();
