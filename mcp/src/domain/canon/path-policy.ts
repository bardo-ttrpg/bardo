const PROTECTED_CANONICAL_PREFIXES = [
	"events/",
	"projections/",
	"world/events/",
	"_settings/",
	"manifests/",
] as const;

const PROTECTED_CANONICAL_EXACT = [
	"state/current.md",
	"state/history.md",
] as const;

function normalizeRelativePath(input: string): string {
	return input
		.replaceAll("\\", "/")
		.trim()
		.replace(/^\.\/+/, "")
		.replace(/^\/+/, "")
		.toLowerCase();
}

export function getCanonicalProtectionReason(
	relativePath: string,
): string | null {
	const normalized = normalizeRelativePath(relativePath);
	if (PROTECTED_CANONICAL_EXACT.includes(normalized as never)) {
		return `Path '${relativePath}' is a protected canonical state artifact.`;
	}
	for (const prefix of PROTECTED_CANONICAL_PREFIXES) {
		if (normalized.startsWith(prefix)) {
			return `Path '${relativePath}' is under protected canonical namespace '${prefix}'.`;
		}
	}
	return null;
}
