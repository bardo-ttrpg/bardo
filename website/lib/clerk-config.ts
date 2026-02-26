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

export function isClerkAuthConfigured({
	publishableKey,
	secretKey,
}: {
	publishableKey: string | null | undefined;
	secretKey: string | null | undefined;
}): boolean {
	return (
		isClerkPublishableKeyConfigured(publishableKey) &&
		isClerkSecretKeyConfigured(secretKey) &&
		doClerkKeysShareEnvironment({
			publishableKey,
			secretKey,
		})
	);
}
