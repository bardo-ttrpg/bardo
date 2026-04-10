import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
	type ToolchainPackageManifest,
	validateToolchainPolicy,
} from "./validate-toolchain-policy-lib";

const ROOT_DIR = process.cwd();

async function fileExists(path: string): Promise<boolean> {
	try {
		await readFile(path, "utf8");
		return true;
	} catch {
		return false;
	}
}

async function collectPackageJsonPaths(): Promise<string[]> {
	const packageDirs = ["website"];
	const packageRoot = join(ROOT_DIR, "packages");
	const packageRootEntries = await readdir(packageRoot, {
		withFileTypes: true,
	}).catch(() => []);

	for (const entry of packageRootEntries) {
		if (entry.isDirectory()) {
			packageDirs.push(join("packages", entry.name));
		}
	}

	return [
		join(ROOT_DIR, "package.json"),
		...packageDirs.map((dir) => join(ROOT_DIR, dir, "package.json")),
	];
}

async function collectPackageJsons(): Promise<ToolchainPackageManifest[]> {
	const paths = await collectPackageJsonPaths();
	const manifests = await Promise.all(
		paths.map(async (path) => {
			const source = await readFile(path, "utf8");
			const parsed = JSON.parse(source) as {
				packageManager?: string;
				scripts?: Record<string, string>;
			};
			return {
				path: `/${relative(ROOT_DIR, path).replaceAll("\\", "/") || "package.json"}`,
				packageManager: parsed.packageManager,
				scripts: parsed.scripts,
			};
		}),
	);

	return manifests;
}

async function collectLockfiles(): Promise<string[]> {
	const candidatePaths = [
		"package-lock.json",
		"pnpm-lock.yaml",
		"yarn.lock",
		"website/package-lock.json",
		"website/pnpm-lock.yaml",
		"website/yarn.lock",
	];

	const lockfiles: string[] = [];
	for (const candidate of candidatePaths) {
		if (await fileExists(join(ROOT_DIR, candidate))) {
			lockfiles.push(`/${candidate}`);
		}
	}

	return lockfiles;
}

async function main() {
	const [packageJsons, lockfiles] = await Promise.all([
		collectPackageJsons(),
		collectLockfiles(),
	]);
	const errors = validateToolchainPolicy({ lockfiles, packageJsons });

	if (errors.length > 0) {
		for (const error of errors) {
			console.error(`error: ${error}`);
		}
		process.exit(1);
	}

	console.log("Toolchain policy is valid.");
}

await main();
