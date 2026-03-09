const LOCALHOST_DEV_ORIGINS = ["127.0.0.1", "localhost", "::1", "[::1]"];

type SecurityHeader = {
	key: string;
	value: string;
};

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

export function resolveShouldUploadSentryArtifacts(
	env: Record<string, string | undefined>,
): boolean {
	if (parseBoolean(env.BARDO_ENFORCE_SENTRY_RELEASE_HEALTH) === true) {
		return true;
	}

	if (parseBoolean(env.CI) === true) {
		return true;
	}

	const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase();
	return vercelEnv === "preview" || vercelEnv === "production";
}

export function resolveSentryBuildSilence(
	env: Record<string, string | undefined>,
): boolean {
	const explicit = parseBoolean(env.BARDO_SENTRY_BUILD_SILENT);
	if (explicit !== null) {
		return explicit;
	}

	return !resolveShouldUploadSentryArtifacts(env);
}

function isProductionDeployment(
	env: Record<string, string | undefined>,
): boolean {
	return (
		env.VERCEL_ENV?.trim().toLowerCase() === "production" ||
		env.NODE_ENV?.trim().toLowerCase() === "production"
	);
}

export function resolveSecurityHeaders(
	env: Record<string, string | undefined>,
): SecurityHeader[] {
	const isProduction = isProductionDeployment(env);
	const allowUnsafeInlineScripts = parseBoolean(
		env.BARDO_CSP_ALLOW_UNSAFE_INLINE_SCRIPTS,
	);
	const scriptSrc = isProduction
		? allowUnsafeInlineScripts === false
			? "script-src 'self' https:"
			: "script-src 'self' 'unsafe-inline' https:"
		: "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:";
	const cspParts = [
		"default-src 'self'",
		"base-uri 'self'",
		"frame-ancestors 'none'",
		"object-src 'none'",
		"img-src 'self' data: blob: https:",
		"font-src 'self' data: https:",
		"style-src 'self' 'unsafe-inline' https:",
		scriptSrc,
		"connect-src 'self' https:",
		"frame-src 'self' https:",
	];
	if (isProduction) {
		cspParts.push("upgrade-insecure-requests");
	}

	const headers: SecurityHeader[] = [
		{
			key: "Content-Security-Policy",
			value: cspParts.join("; "),
		},
		{
			key: "X-Frame-Options",
			value: "DENY",
		},
		{
			key: "X-Content-Type-Options",
			value: "nosniff",
		},
		{
			key: "Referrer-Policy",
			value: "strict-origin-when-cross-origin",
		},
		{
			key: "Permissions-Policy",
			value:
				"accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
		},
	];
	if (isProduction) {
		headers.push({
			key: "Strict-Transport-Security",
			value: "max-age=63072000; includeSubDomains; preload",
		});
	}

	return headers;
}
