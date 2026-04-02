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

function isProductionDeployment(
	env: Record<string, string | undefined>,
): boolean {
	const nodeEnv = env.NODE_ENV?.trim().toLowerCase();
	if (nodeEnv === "development") {
		return false;
	}

	return (
		env.VERCEL_ENV?.trim().toLowerCase() === "production" ||
		nodeEnv === "production"
	);
}

export function resolveSecurityHeaders(
	env: Record<string, string | undefined>,
): SecurityHeader[] {
	const isProduction = isProductionDeployment(env);
	const allowUnsafeInlineScripts = parseBoolean(
		env.BARDO_CSP_ALLOW_UNSAFE_INLINE_SCRIPTS,
	);
	// The App Router currently emits inline runtime and metadata scripts that are
	// incompatible with a static header-only nonce strategy. Until the app moves
	// to per-request nonces or hashes, production needs inline script allowance to
	// avoid blocking first-party Next.js behavior on public routes.
	const scriptSrc = isProduction
		? allowUnsafeInlineScripts === false
			? "script-src 'self' https:"
			: "script-src 'self' 'unsafe-inline' https:"
		: "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:";
	const connectSrc = isProduction
		? "connect-src 'self' https:"
		: "connect-src 'self' http: https: ws: wss:";
	const cspParts = [
		"default-src 'self'",
		"base-uri 'self'",
		"frame-ancestors 'none'",
		"object-src 'none'",
		"img-src 'self' data: blob: https:",
		"font-src 'self' data: https:",
		"style-src 'self' 'unsafe-inline' https:",
		scriptSrc,
		connectSrc,
		"frame-src 'self' https:",
	];
	if (!isProduction) {
		cspParts.push("worker-src 'self' blob:");
	}
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
