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

	requireExact(normalize(env.NODE_ENV), "production", "NODE_ENV", errors);
	requireExact(
		normalize(env.BARDO_AUTH_PROVIDER),
		"hosted",
		"BARDO_AUTH_PROVIDER",
		errors,
	);
	requireExact(
		normalize(env.BARDO_AUTH_MODE),
		"required",
		"BARDO_AUTH_MODE",
		errors,
	);
	requireHttpsUrl(
		normalize(env.BARDO_AUTH_INTROSPECTION_URL),
		"BARDO_AUTH_INTROSPECTION_URL",
		errors,
	);
	if (!normalize(env.BARDO_AUTH_INTROSPECTION_TOKEN)) {
		errors.push("BARDO_AUTH_INTROSPECTION_TOKEN is missing");
	}

	requireExact(
		normalize(env.BARDO_STRICT_CANONICAL_MODE),
		"true",
		"BARDO_STRICT_CANONICAL_MODE",
		errors,
	);
	requireExact(
		normalize(env.BARDO_DEFAULT_RULESET),
		"d20_v1",
		"BARDO_DEFAULT_RULESET",
		errors,
	);
	requireExact(
		normalize(env.BARDO_GUIDED_SETUP_ENABLED),
		"false",
		"BARDO_GUIDED_SETUP_ENABLED",
		errors,
	);
	requireExact(
		normalize(env.BARDO_MCP_TRANSPORT_MODE),
		"stateful",
		"BARDO_MCP_TRANSPORT_MODE",
		errors,
	);

	requireExact(
		normalize(env.BARDO_SENTRY_ENABLED),
		"true",
		"BARDO_SENTRY_ENABLED",
		errors,
	);
	if (!normalize(env.SENTRY_DSN)) {
		errors.push("SENTRY_DSN is missing");
	}
	requireExact(
		normalize(env.SENTRY_ENVIRONMENT),
		"staging",
		"SENTRY_ENVIRONMENT",
		errors,
	);
	if (!normalize(env.SENTRY_RELEASE)) {
		errors.push("SENTRY_RELEASE is missing");
	}

	if (normalize(env.BARDO_API_KEYS_JSON)) {
		warnings.push(
			"BARDO_API_KEYS_JSON is set; hosted auth staging should normally rely on introspection instead.",
		);
	}

	const upstashUrl = normalize(env.UPSTASH_REDIS_REST_URL);
	const upstashToken = normalize(env.UPSTASH_REDIS_REST_TOKEN);
	if (upstashUrl || upstashToken) {
		if (!upstashUrl || !upstashToken) {
			errors.push(
				"UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must both be set when either is configured.",
			);
		}
	} else if (
		normalize(env.BARDO_MCP_USAGE_LIMIT_ALLOW_MEMORY_FALLBACK) !== "true"
	) {
		errors.push(
			"BARDO_MCP_USAGE_LIMIT_ALLOW_MEMORY_FALLBACK must be true in staging when Upstash is not configured.",
		);
	}

	if (normalize(env.BARDO_TELEMETRY_ENABLED) !== "true") {
		warnings.push(
			"BARDO_TELEMETRY_ENABLED is not true; staging observability will be reduced.",
		);
	}
	if (normalize(env.BARDO_METRICS_ROUTE_ENABLED) !== "true") {
		warnings.push(
			"BARDO_METRICS_ROUTE_ENABLED is not true; staging metrics checks will be limited.",
		);
	}
	if (normalize(env.BARDO_METRICS_REQUIRE_AUTH) !== "true") {
		warnings.push("BARDO_METRICS_REQUIRE_AUTH should stay true in staging.");
	}

	return { errors, warnings };
}
