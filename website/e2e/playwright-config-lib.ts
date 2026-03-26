export function resolvePlaywrightBaseUrl(
	env: Record<string, string | undefined>,
	port: number,
): string {
	const configuredLoopbackHost = env.PLAYWRIGHT_LOOPBACK_HOST;
	const defaultHost = configuredLoopbackHost ?? "localhost";
	const defaultBaseUrl = defaultHost.includes(":")
		? `http://[${defaultHost}]:${String(port)}`
		: `http://${defaultHost}:${String(port)}`;

	return env.PLAYWRIGHT_BASE_URL ?? defaultBaseUrl;
}

export function resolvePlaywrightExtraHttpHeaders(
	env: Record<string, string | undefined>,
): Record<string, string> {
	const bypassSecret =
		env.PLAYWRIGHT_VERCEL_PROTECTION_BYPASS_SECRET?.trim() ??
		env.STAGING_VERCEL_PROTECTION_BYPASS_SECRET?.trim() ??
		"";

	if (!bypassSecret) {
		return {};
	}

	return {
		"x-vercel-protection-bypass": bypassSecret,
		"x-vercel-set-bypass-cookie": "true",
	};
}

export function shouldStartPlaywrightWebServer(baseURL: string): boolean {
	const { hostname, protocol } = new URL(baseURL);
	if (protocol !== "http:" && protocol !== "https:") {
		return true;
	}

	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1" ||
		hostname === "[::1]"
	);
}

export function resolvePlaywrightLocalAppUrl(
	host: string,
	port: number,
): string {
	return host.includes(":")
		? `http://[${host}]:${String(port)}`
		: `http://${host}:${String(port)}`;
}

export function resolvePlaywrightWebServerHost(
	env: Record<string, string | undefined>,
	_baseURL: string,
): string {
	return env.PLAYWRIGHT_LOOPBACK_HOST ?? "localhost";
}

export function resolvePlaywrightWebServerPort(
	env: Record<string, string | undefined>,
	baseURL: string,
	port: number,
): number {
	if (env.PLAYWRIGHT_PORT) {
		return Number.parseInt(env.PLAYWRIGHT_PORT, 10);
	}

	const parsedPort = Number.parseInt(new URL(baseURL).port || "", 10);
	return parsedPort || port;
}
