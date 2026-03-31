const CLEAN_ROOM_EXCLUDED_SEGMENTS = new Set([
	".git",
	".next",
	".turbo",
	"coverage",
	"dist",
	"node_modules",
	"test-results",
]);

export function toPortableRelativePath(path: string): string {
	return path
		.replaceAll("\\", "/")
		.replace(/^\.\/+/, "")
		.replace(/\/+/g, "/")
		.replace(/\/$/, "");
}

export function shouldExcludeFromDevExitCleanRoom(
	relativePath: string,
): boolean {
	const normalized = toPortableRelativePath(relativePath);
	if (!normalized) {
		return false;
	}

	return normalized
		.split("/")
		.some((segment) => CLEAN_ROOM_EXCLUDED_SEGMENTS.has(segment));
}
