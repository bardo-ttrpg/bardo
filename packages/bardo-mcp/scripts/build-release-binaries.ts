import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveReleaseArtifacts } from "../src/release-targets";

type PackageJson = {
	version: string;
};

async function readPackageVersion(): Promise<string> {
	const packageJsonPath = path.join(import.meta.dir, "..", "package.json");
	const raw = await readFile(packageJsonPath, "utf8");
	const parsed = JSON.parse(raw) as Partial<PackageJson>;
	if (
		typeof parsed.version !== "string" ||
		parsed.version.trim().length === 0
	) {
		throw new Error("packages/bardo-mcp/package.json is missing a version.");
	}
	return parsed.version.trim();
}

async function sha256File(filePath: string): Promise<string> {
	const contents = await readFile(filePath);
	return createHash("sha256").update(contents).digest("hex");
}

const version = await readPackageVersion();
const artifacts = resolveReleaseArtifacts({ version });
const packageRoot = path.join(import.meta.dir, "..");
const entrypoint = path.join(packageRoot, "src/cli.ts");
const releaseDir = path.join(packageRoot, "dist/release");

await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

for (const artifact of artifacts) {
	const result = await Bun.build({
		entrypoints: [entrypoint],
		outdir: releaseDir,
		compile: {
			target: artifact.target,
			outfile: path.join(packageRoot, artifact.outfile),
			execArgv: [],
		},
		minify: true,
		target: "bun",
	});
	if (!result.success) {
		throw new AggregateError(result.logs, `Failed to build ${artifact.target}`);
	}
}

const sums = await Promise.all(
	artifacts.map(async (artifact) => {
		const hash = await sha256File(path.join(packageRoot, artifact.outfile));
		return `${hash}  ${artifact.filename}`;
	}),
);
await writeFile(
	path.join(releaseDir, "SHA256SUMS.txt"),
	`${sums.join("\n")}\n`,
	"utf8",
);

console.log(`Built ${artifacts.length} release artifacts in ${releaseDir}`);
