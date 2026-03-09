type ValidationResult = {
	errors: string[];
	warnings: string[];
};

function normalize(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function requireExact(
	value: string | undefined,
	expected: string,
	label: string,
	errors: string[],
) {
	if (!value) {
		errors.push(`${label} is missing`);
		return;
	}
	if (value !== expected) {
		errors.push(`${label} must be ${expected} for staging`);
	}
}

function requirePrefix(
	value: string | undefined,
	prefix: string,
	label: string,
	errors: string[],
) {
	if (!value) {
		errors.push(`${label} is missing`);
		return;
	}
	if (!value.startsWith(prefix)) {
		errors.push(`${label} must start with ${prefix} for staging`);
	}
}

function requireHttpsUrl(
	value: string | undefined,
	label: string,
	errors: string[],
) {
	if (!value) {
		errors.push(`${label} is missing`);
		return;
	}
	try {
		const url = new URL(value);
		if (url.protocol !== "https:") {
			errors.push(`${label} must use https for staging`);
		}
		if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
			errors.push(`${label} must not point to localhost for staging`);
		}
	} catch {
		errors.push(`${label} must be a valid URL`);
	}
}

export function validateStagingEnv(
	env: Record<string, string | undefined>,
): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	requirePrefix(
		normalize(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
		"pk_test_",
		"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
		errors,
	);
	requirePrefix(
		normalize(env.CLERK_SECRET_KEY),
		"sk_test_",
		"CLERK_SECRET_KEY",
		errors,
	);
	requireHttpsUrl(
		normalize(env.NEXT_PUBLIC_APP_URL),
		"NEXT_PUBLIC_APP_URL",
		errors,
	);
	requireHttpsUrl(
		normalize(env.BARDO_MCP_BASE_URL),
		"BARDO_MCP_BASE_URL",
		errors,
	);

	if (!normalize(env.BARDO_AUTH_INTROSPECTION_TOKEN)) {
		errors.push("BARDO_AUTH_INTROSPECTION_TOKEN is missing");
	}
	if (!normalize(env.BARDO_CLI_LOGIN_SECRET)) {
		errors.push("BARDO_CLI_LOGIN_SECRET is missing");
	}

	requireExact(
		normalize(env.SENTRY_ENVIRONMENT),
		"staging",
		"SENTRY_ENVIRONMENT",
		errors,
	);
	if (normalize(env.NEXT_PUBLIC_SENTRY_DSN)) {
		requireExact(
			normalize(env.NEXT_PUBLIC_SENTRY_ENVIRONMENT),
			"staging",
			"NEXT_PUBLIC_SENTRY_ENVIRONMENT",
			errors,
		);
	}

	if (!normalize(env.SENTRY_RELEASE)) {
		errors.push("SENTRY_RELEASE is missing");
	}

	const upstashUrl =
		normalize(env.BARDO_CLI_DEVICE_SESSION_UPSTASH_REDIS_REST_URL) ||
		normalize(env.UPSTASH_REDIS_REST_URL);
	const upstashToken =
		normalize(env.BARDO_CLI_DEVICE_SESSION_UPSTASH_REDIS_REST_TOKEN) ||
		normalize(env.UPSTASH_REDIS_REST_TOKEN);
	const upstashDatabase =
		normalize(env.BARDO_CLI_DEVICE_SESSION_UPSTASH_DATABASE_NAME) ||
		normalize(env.UPSTASH_REDIS_DATABASE_NAME);

	if (upstashUrl || upstashToken || upstashDatabase) {
		if (!upstashUrl || !upstashToken) {
			errors.push(
				"Staging Upstash configuration requires both REST URL and token when either is set.",
			);
		}
		if (upstashDatabase && upstashDatabase !== "bardo-staging") {
			errors.push(
				"Staging Upstash configuration must use the bardo-staging database.",
			);
		}
	} else {
		warnings.push(
			"Upstash is not configured for staging; confirm documented memory fallbacks stay enabled.",
		);
	}

	return { errors, warnings };
}
