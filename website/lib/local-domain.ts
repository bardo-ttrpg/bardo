const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLocalhostHostname(
	hostname: string | null | undefined,
): boolean {
	return typeof hostname === "string" && LOCALHOST_HOSTNAMES.has(hostname);
}

function parseLocalHostFromAppUrl(
	appUrl: string | null | undefined,
): string | null {
	const normalized = appUrl?.trim();
	if (!normalized) return null;

	try {
		const parsed = new URL(normalized);
		if (LOCALHOST_HOSTNAMES.has(parsed.hostname)) {
			return parsed.hostname;
		}
		return null;
	} catch {
		return null;
	}
}

export function resolveCanonicalLocalhost({
	requestHostname,
	appUrl,
}: {
	requestHostname: string;
	appUrl: string | null | undefined;
}): string | null {
	if (!isLocalhostHostname(requestHostname)) {
		return null;
	}

	const canonicalHost = parseLocalHostFromAppUrl(appUrl) ?? "localhost";
	return requestHostname === canonicalHost ? null : canonicalHost;
}

export function shouldRedirectToCanonicalLocalhost({
	requestHostname,
	requestUrlHostname,
	appUrl,
}: {
	requestHostname: string;
	requestUrlHostname: string;
	appUrl: string | null | undefined;
}): string | null {
	const targetHost = resolveCanonicalLocalhost({
		requestHostname,
		appUrl,
	});
	if (!targetHost) return null;

	// Next.js may already normalize the internal request URL hostname.
	// Redirecting in that case can downgrade to a relative Location and loop.
	return requestUrlHostname === targetHost ? null : targetHost;
}
