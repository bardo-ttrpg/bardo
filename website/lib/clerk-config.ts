export function isClerkPublishableKeyConfigured(
	publishableKey: string | null | undefined,
): boolean {
	if (!publishableKey) return false;
	const normalized = publishableKey.trim();
	return (
		normalized.startsWith("pk_") &&
		!normalized.includes("_your_") &&
		!normalized.includes("REPLACE_ME")
	);
}

export function isClerkSecretKeyConfigured(
	secretKey: string | null | undefined,
): boolean {
	if (!secretKey) return false;
	const normalized = secretKey.trim();
	return (
		normalized.startsWith("sk_") &&
		!normalized.includes("_your_") &&
		!normalized.includes("REPLACE_ME")
	);
}

function clerkKeyMode(
	key: string | null | undefined,
	prefix: "pk" | "sk",
): "test" | "live" | null {
	const normalized = key?.trim() ?? "";
	const match = normalized.match(new RegExp(`^${prefix}_(test|live)_`));
	if (!match) return null;
	return match[1] === "test" ? "test" : "live";
}

export function doClerkKeysShareEnvironment({
	publishableKey,
	secretKey,
}: {
	publishableKey: string | null | undefined;
	secretKey: string | null | undefined;
}): boolean {
	const publishableMode = clerkKeyMode(publishableKey, "pk");
	const secretMode = clerkKeyMode(secretKey, "sk");
	if (!publishableMode || !secretMode) return false;
	return publishableMode === secretMode;
}

export function isClerkIssuerDomainConfigured(
	issuerDomain: string | null | undefined,
): boolean {
	if (!issuerDomain) return false;
	const normalized = issuerDomain.trim();
	if (!normalized.startsWith("https://")) return false;
	if (normalized.includes("REPLACE_ME")) return false;

	try {
		const parsed = new URL(normalized);
		return parsed.hostname.endsWith(".clerk.accounts.dev");
	} catch {
		return false;
	}
}

function base64UrlToText(value: string): string | null {
	const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
	const padLength = (4 - (normalized.length % 4)) % 4;
	const padded = normalized + "=".repeat(padLength);

	try {
		return atob(padded);
	} catch {
		return null;
	}
}

function issuerHostname(value: string): string | null {
	const normalized = value.trim();
	if (!normalized) return null;
	try {
		return new URL(normalized).hostname;
	} catch {
		return null;
	}
}

function decodeSessionTokenPayload(
	sessionToken: string | null | undefined,
): Record<string, unknown> | null {
	const normalized = sessionToken?.trim();
	if (!normalized) return null;

	const parts = normalized.split(".");
	if (parts.length < 2) return null;

	const payloadRaw = base64UrlToText(parts[1] ?? "");
	if (!payloadRaw) return null;

	try {
		const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
		return payload;
	} catch {
		return null;
	}
}

function normalizeHostname(hostname: string): string {
	return hostname
		.trim()
		.toLowerCase()
		.replace(/^\[|\]$/g, "");
}

function areEquivalentLocalHosts(a: string, b: string): boolean {
	const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
	return localHosts.has(a) && localHosts.has(b);
}

export function clerkDomainFromPublishableKey(
	publishableKey: string | null | undefined,
): string | null {
	if (!isClerkPublishableKeyConfigured(publishableKey)) {
		return null;
	}

	const normalized = publishableKey?.trim() ?? "";
	const encodedDomain = normalized.split("_").slice(2).join("_");
	if (!encodedDomain) {
		return null;
	}

	const decoded = base64UrlToText(encodedDomain);
	if (!decoded) {
		return null;
	}

	const withoutTerminator = decoded.replace(/\$/g, "").trim();
	return withoutTerminator.length > 0 ? withoutTerminator : null;
}

export function doesClerkDomainMatchIssuer({
	publishableKey,
	issuerDomain,
}: {
	publishableKey: string | null | undefined;
	issuerDomain: string | null | undefined;
}): boolean {
	if (!isClerkIssuerDomainConfigured(issuerDomain)) {
		return false;
	}

	const keyDomain = clerkDomainFromPublishableKey(publishableKey);
	if (!keyDomain) {
		return false;
	}

	try {
		const issuer = new URL(issuerDomain?.trim() ?? "");
		return issuer.hostname === keyDomain;
	} catch {
		return false;
	}
}

export function issuerHostFromSessionToken(
	sessionToken: string | null | undefined,
): string | null {
	const payload = decodeSessionTokenPayload(sessionToken);
	if (!payload) return null;
	if (typeof payload.iss !== "string") return null;
	return issuerHostname(payload.iss);
}

export function authorizedPartyHostFromSessionToken(
	sessionToken: string | null | undefined,
): string | null {
	const payload = decodeSessionTokenPayload(sessionToken);
	if (!payload) return null;
	if (typeof payload.azp !== "string") return null;

	const directHostname = issuerHostname(payload.azp);
	if (directHostname) {
		return normalizeHostname(directHostname);
	}

	// Fallback for non-URL host claims.
	return normalizeHostname(payload.azp);
}

export function shouldResetClerkSessionForIssuer({
	sessionToken,
	issuerDomain,
}: {
	sessionToken: string | null | undefined;
	issuerDomain: string | null | undefined;
}): boolean {
	const tokenIssuerHost = issuerHostFromSessionToken(sessionToken);
	if (!tokenIssuerHost) return false;

	const configuredIssuerHost = issuerHostname(issuerDomain ?? "");
	if (!configuredIssuerHost) return false;

	return tokenIssuerHost !== configuredIssuerHost;
}

export function shouldResetClerkSessionForRequest({
	sessionToken,
	issuerDomain,
	requestHostname,
}: {
	sessionToken: string | null | undefined;
	issuerDomain: string | null | undefined;
	requestHostname: string;
}): boolean {
	if (
		shouldResetClerkSessionForIssuer({
			sessionToken,
			issuerDomain,
		})
	) {
		return true;
	}

	const azpHost = authorizedPartyHostFromSessionToken(sessionToken);
	if (!azpHost) return false;

	const normalizedRequestHost = normalizeHostname(requestHostname);
	if (!normalizedRequestHost) return false;

	if (
		normalizedRequestHost === azpHost ||
		areEquivalentLocalHosts(normalizedRequestHost, azpHost)
	) {
		return false;
	}

	return true;
}

export function isClerkAuthConfigured({
	publishableKey,
	secretKey,
	issuerDomain,
}: {
	publishableKey: string | null | undefined;
	secretKey: string | null | undefined;
	issuerDomain: string | null | undefined;
}): boolean {
	return (
		isClerkPublishableKeyConfigured(publishableKey) &&
		isClerkSecretKeyConfigured(secretKey) &&
		doClerkKeysShareEnvironment({
			publishableKey,
			secretKey,
		}) &&
		doesClerkDomainMatchIssuer({
			publishableKey,
			issuerDomain,
		})
	);
}
