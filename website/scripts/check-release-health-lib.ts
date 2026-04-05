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

function requireHttpsUrl(
	value: string | undefined,
	label: string,
	errors: string[],
): string | undefined {
	const normalized = requireValue(value, label, errors);
	if (!normalized) {
		return undefined;
	}

	try {
		const url = new URL(normalized);
		if (url.protocol !== "https:") {
			errors.push(`${label} must use https in release environments`);
			return undefined;
		}
		if (
			url.hostname === "localhost" ||
			url.hostname === "127.0.0.1" ||
			url.hostname === "::1"
		) {
			errors.push(`${label} must not point to localhost in release environments`);
			return undefined;
		}
		return normalized;
	} catch {
		errors.push(`${label} must be a valid URL`);
		return undefined;
	}
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
	requireHttpsUrl(env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL", errors);
	requireHttpsUrl(env.BARDO_APP_BASE_URL, "BARDO_APP_BASE_URL", errors);
	requireHttpsUrl(env.BARDO_MCP_BASE_URL, "BARDO_MCP_BASE_URL", errors);
	requireHttpsUrl(
		env.BARDO_RUNTIME_STATUS_URL,
		"BARDO_RUNTIME_STATUS_URL",
		errors,
	);
	requireHttpsUrl(
		env.BARDO_BRIDGE_SESSION_REFRESH_URL,
		"BARDO_BRIDGE_SESSION_REFRESH_URL",
		errors,
	);

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
