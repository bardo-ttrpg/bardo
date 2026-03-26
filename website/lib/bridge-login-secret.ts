export const BRIDGE_LOGIN_SECRET_MISSING_MESSAGE =
	"Bridge login exchange is not configured. Set BARDO_BRIDGE_LOGIN_SECRET.";

export function resolveBridgeLoginSecret(
	env: Record<string, string | undefined> = process.env,
): string | null {
	const explicitSecret = env.BARDO_BRIDGE_LOGIN_SECRET?.trim();
	if (explicitSecret) {
		return explicitSecret;
	}

	return null;
}
