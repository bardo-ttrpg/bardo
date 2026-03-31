export function resolveBridgeLoginSecret(
	env: Record<string, string | undefined> = process.env,
): string | null {
	const explicitSecret = env.BARDO_BRIDGE_LOGIN_SECRET?.trim();
	if (explicitSecret) {
		return explicitSecret;
	}

	return null;
}
