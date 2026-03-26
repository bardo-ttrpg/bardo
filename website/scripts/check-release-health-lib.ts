type CheckReleaseHealthResult = {
	skipped: boolean;
	errors: string[];
	warnings: string[];
	release: string | undefined;
};

function normalize(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function isReleaseHealthEnforced(
	env: Record<string, string | undefined>,
): boolean {
	const vercelEnv = normalize(env.VERCEL_ENV)?.toLowerCase();
	return (
		env.CI === "true" ||
		vercelEnv === "preview" ||
		vercelEnv === "production" ||
		env.BARDO_ENFORCE_RELEASE_HEALTH === "true"
	);
}

function requireValue(
	value: string | undefined,
	label: string,
	errors: string[],
): string | undefined {
	const normalized = normalize(value);
	if (!normalized) {
		errors.push(`${label} is missing`);
		return undefined;
	}
	return normalized;
}

function resolveReleaseIdentifier(
	env: Record<string, string | undefined>,
): string | undefined {
	return (
		normalize(env.BARDO_RC_SHA) ??
		normalize(env.VERCEL_GIT_COMMIT_SHA) ??
		normalize(env.GITHUB_SHA) ??
		normalize(env.SOURCE_VERSION) ??
		normalize(env.COMMIT_SHA)
	);
}

export async function checkReleaseHealth(
	env: Record<string, string | undefined>,
): Promise<CheckReleaseHealthResult> {
	if (!isReleaseHealthEnforced(env)) {
		return {
			skipped: true,
			errors: [],
			warnings: [],
			release: undefined,
		};
	}

	const errors: string[] = [];
	const warnings: string[] = [];

	requireValue(
		env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
		"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
		errors,
	);
	requireValue(env.CLERK_SECRET_KEY, "CLERK_SECRET_KEY", errors);
	requireValue(env.BARDO_MCP_BASE_URL, "BARDO_MCP_BASE_URL", errors);
	requireValue(env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL", errors);

	const release = resolveReleaseIdentifier(env);
	if (!release) {
		errors.push("BARDO_RC_SHA or deployment commit SHA is missing");
	}

	return {
		skipped: false,
		errors,
		warnings,
		release,
	};
}
