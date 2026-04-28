import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const releaseVersion = process.argv[2] ?? "v0.1.1";
const releaseParent = path.resolve(
	process.cwd(),
	"..",
	"packages",
	"bardo-mcp",
	"dist",
	"release",
);
const versionedReleaseRoot = path.join(releaseParent, releaseVersion);
const releaseRoot = (
	await stat(versionedReleaseRoot).catch(() => null)
)?.isDirectory()
	? versionedReleaseRoot
	: releaseParent;

const uploadPathRoot = path.join(releaseParent, releaseVersion);

function contentTypeFor(filePath: string): string {
	if (filePath.endsWith(".txt")) {
		return "text/plain; charset=utf-8";
	}
	if (filePath.endsWith(".ps1")) {
		return "text/plain; charset=utf-8";
	}
	if (filePath.endsWith(".zip")) {
		return "application/zip";
	}
	if (filePath.endsWith(".tar.gz")) {
		return "application/gzip";
	}
	return "application/octet-stream";
}

async function filesUnder(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				return await filesUnder(fullPath);
			}
			if (entry.isFile()) {
				return [fullPath];
			}
			return [];
		}),
	);
	return files.flat();
}

async function main() {
	const convexUrl =
		process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
	if (!convexUrl) {
		throw new Error("CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is required.");
	}
	const token = process.env.BARDO_CONVEX_BACKEND_SECRET;
	if (!token) {
		throw new Error("BARDO_CONVEX_BACKEND_SECRET is required.");
	}

	const client = new ConvexHttpClient(convexUrl);
	const files = await filesUnder(releaseRoot);
	if (files.length === 0) {
		throw new Error(`No release files found under ${releaseRoot}`);
	}

	for (const filePath of files) {
		const body = await readFile(filePath);
		const uploadUrl = await client.mutation(
			api.releaseFiles.generateUploadUrl,
			{ token },
		);
		const contentType = contentTypeFor(filePath);
		const upload = await fetch(uploadUrl, {
			method: "POST",
			headers: { "content-type": contentType },
			body,
		});
		if (!upload.ok) {
			throw new Error(
				`Failed to upload ${filePath}: ${upload.status} ${await upload.text()}`,
			);
		}
		const { storageId } = (await upload.json()) as { storageId: string };
		const relativePath = path
			.relative(
				path.dirname(uploadPathRoot),
				path.join(uploadPathRoot, path.basename(filePath)),
			)
			.split(path.sep)
			.join("/");
		await client.mutation(api.releaseFiles.saveReleaseFile, {
			path: `releases/${relativePath}`,
			storageId: storageId as Id<"_storage">,
			size: (await stat(filePath)).size,
			sha256: createHash("sha256").update(body).digest("hex"),
			contentType,
			token,
		});
		console.log(`uploaded releases/${relativePath}`);
	}
}

await main();
