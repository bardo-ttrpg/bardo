import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export async function inspectPath(targetPath: string): Promise<{
	exists: boolean;
	isDirectory: boolean;
}> {
	try {
		const details = await stat(targetPath);
		return { exists: true, isDirectory: details.isDirectory() };
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return { exists: false, isDirectory: false };
		}
		throw error;
	}
}

export function resolveBardoRoot(campaignBasePath: string): string {
	return path.basename(campaignBasePath) === "bardo"
		? campaignBasePath
		: path.resolve(campaignBasePath, "bardo");
}

export function resolvePathInsideRoot(
	rootPath: string,
	relativePath: string,
): string {
	let decodedPath = relativePath;
	try {
		decodedPath = decodeURIComponent(relativePath);
	} catch {
		throw new Error("Path contains invalid URL encoding");
	}

	const normalized = decodedPath.replaceAll("\\", "/").trim();
	if (!normalized || normalized.startsWith("/")) {
		throw new Error("Path must be a non-empty relative path");
	}

	const absolute = path.resolve(rootPath, normalized);
	const relativeFromRoot = path.relative(rootPath, absolute);
	if (
		relativeFromRoot === ".." ||
		relativeFromRoot.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relativeFromRoot)
	) {
		throw new Error("Path escapes bardo root");
	}

	return absolute;
}

export function ensureMarkdownPath(targetPath: string): void {
	if (!targetPath.toLowerCase().endsWith(".md")) {
		throw new Error("Path must end with .md");
	}
}

export async function ensureParentDirectoryExists(
	filePath: string,
): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true });
}

export async function readTextIfExists(
	filePath: string,
): Promise<string | null> {
	try {
		return await readFile(filePath, "utf8");
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return null;
		}
		throw error;
	}
}
