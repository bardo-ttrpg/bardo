export function isClerkPublishableKeyConfigured(
	publishableKey: string | null | undefined,
): boolean {
	if (!publishableKey) return false;
	return (
		publishableKey.startsWith("pk_") &&
		!publishableKey.includes("_your_") &&
		!publishableKey.includes("REPLACE_ME")
	);
}

export function isClerkSecretKeyConfigured(
	secretKey: string | null | undefined,
): boolean {
	if (!secretKey) return false;
	return (
		secretKey.startsWith("sk_") &&
		!secretKey.includes("_your_") &&
		!secretKey.includes("REPLACE_ME")
	);
}

export function isClerkAuthConfigured({
	publishableKey,
	secretKey,
}: {
	publishableKey: string | null | undefined;
	secretKey: string | null | undefined;
}): boolean {
	return (
		isClerkPublishableKeyConfigured(publishableKey) &&
		isClerkSecretKeyConfigured(secretKey)
	);
}
