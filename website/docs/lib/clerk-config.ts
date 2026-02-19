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
		doesClerkDomainMatchIssuer({
			publishableKey,
			issuerDomain,
		})
	);
}
