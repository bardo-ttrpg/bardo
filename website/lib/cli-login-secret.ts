export const CLI_LOGIN_SECRET_MISSING_MESSAGE =
	"CLI login exchange is not configured. Set BARDO_CLI_LOGIN_SECRET (or BARDO_AUTH_INTROSPECTION_TOKEN for local fallback).";

export function resolveCliLoginSecret(
	env: Record<string, string | undefined> = process.env,
): string | null {
	const explicitSecret = env.BARDO_CLI_LOGIN_SECRET?.trim();
	if (explicitSecret) {
		return explicitSecret;
	}

	const fallbackSecret = env.BARDO_AUTH_INTROSPECTION_TOKEN?.trim();
	if (fallbackSecret) {
		return fallbackSecret;
	}

	return null;
}
