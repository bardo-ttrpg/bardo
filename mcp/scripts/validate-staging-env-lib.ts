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
		"true",
		"BARDO_GUIDED_SETUP_ENABLED",
		errors,
	);
	requireExact(
		normalize(env.BARDO_SETUP_CONTRACT_V2_REQUIRED),
		"true",
		"BARDO_SETUP_CONTRACT_V2_REQUIRED",
		errors,
	);
	requireExact(
		normalize(env.BARDO_MCP_TRANSPORT_MODE),
		"stateless",
		"BARDO_MCP_TRANSPORT_MODE",
		errors,
	);
	requireExact(
		normalize(env.BARDO_MCP_ENABLE_JSON_RESPONSE),
		"true",
		"BARDO_MCP_ENABLE_JSON_RESPONSE",
		errors,
	);
	requireExact(
		normalize(env.BARDO_RATE_LIMIT_FAIL_CLOSED),
		"true",
		"BARDO_RATE_LIMIT_FAIL_CLOSED",
		errors,
	);
	requireExact(
		normalize(env.BARDO_ALLOW_QUERY_API_KEY),
		"false",
		"BARDO_ALLOW_QUERY_API_KEY",
		errors,
	);

	if (normalize(env.BARDO_API_KEYS_JSON)) {
		warnings.push(
			"BARDO_API_KEYS_JSON is set; hosted auth staging should normally rely on introspection instead.",
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
