export function clerkIdFromIdentity(
	identity: { subject?: unknown } | null,
): string | null {
	if (!identity || typeof identity.subject !== "string") {
		return null;
	}

	const clerkId = identity.subject.trim();
	return clerkId.length > 0 ? clerkId : null;
}
