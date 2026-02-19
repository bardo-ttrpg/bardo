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
