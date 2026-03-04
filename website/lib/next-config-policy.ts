const LOCALHOST_DEV_ORIGINS = ["127.0.0.1", "localhost", "::1", "[::1]"];

function parseBoolean(value: string | undefined): boolean | null {
	if (!value) return null;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return null;
}

export function resolveAllowedDevOrigins(
	env: Record<string, string | undefined>,
): string[] {
	const configuredOrigins = env.BARDO_ALLOWED_DEV_ORIGINS?.split(",")
		.map((origin) => origin.trim())
		.filter((origin) => origin.length > 0);

	return Array.from(
		new Set([...LOCALHOST_DEV_ORIGINS, ...(configuredOrigins ?? [])]),
	);
}

export function resolveSentryBuildSilence(
	env: Record<string, string | undefined>,
): boolean {
	const explicit = parseBoolean(env.BARDO_SENTRY_BUILD_SILENT);
	if (explicit !== null) {
		return explicit;
	}

	const inCi = parseBoolean(env.CI) === true;
	const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase();
	const isHostedBuild = vercelEnv === "preview" || vercelEnv === "production";
	const isProductionNode = env.NODE_ENV?.trim().toLowerCase() === "production";

	return !(inCi || isHostedBuild || isProductionNode);
}
