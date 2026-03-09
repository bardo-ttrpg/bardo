export function resolvePlaywrightBaseUrl(
	env: Record<string, string | undefined>,
	port: number,
): string {
	const configuredLoopbackHost = env.PLAYWRIGHT_LOOPBACK_HOST;
	const defaultHost = configuredLoopbackHost ?? "127.0.0.1";
	const defaultBaseUrl = defaultHost.includes(":")
		? `http://[${defaultHost}]:${String(port)}`
		: `http://${defaultHost}:${String(port)}`;

	return env.PLAYWRIGHT_BASE_URL ?? defaultBaseUrl;
}

export function resolvePlaywrightWebServerHost(
	env: Record<string, string | undefined>,
	_baseURL: string,
): string {
	return env.PLAYWRIGHT_LOOPBACK_HOST ?? "127.0.0.1";
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
