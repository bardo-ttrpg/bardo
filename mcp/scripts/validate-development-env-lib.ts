type ValidationResult = {
	errors: string[];
	warnings: string[];
};

function normalize(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function requireLocalUrl(
	value: string | undefined,
	label: string,
	errors: string[],
) {
	if (!value) {
		return;
	}
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			errors.push(`${label} must use http or https for development`);
		}
		if (
			url.hostname !== "localhost" &&
			url.hostname !== "127.0.0.1" &&
			url.hostname !== "::1"
		) {
			errors.push(`${label} should point to localhost during development`);
		}
	} catch {
		errors.push(`${label} must be a valid URL`);
	}
}

function isLocalHostValue(value: string): boolean {
	return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

export function validateDevelopmentEnv(
	env: Record<string, string | undefined>,
): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (normalize(env.NODE_ENV) === "production") {
		errors.push("NODE_ENV must not be production for development validation");
	}

	if (normalize(env.BARDO_AUTH_PROVIDER) === "hosted") {
		if (!normalize(env.BARDO_AUTH_INTROSPECTION_URL)) {
			errors.push(
				"BARDO_AUTH_INTROSPECTION_URL is required when BARDO_AUTH_PROVIDER=hosted during development",
			);
		}
		if (!normalize(env.BARDO_AUTH_INTROSPECTION_TOKEN)) {
			errors.push(
				"BARDO_AUTH_INTROSPECTION_TOKEN is required when BARDO_AUTH_PROVIDER=hosted during development",
			);
		}
		requireLocalUrl(
			normalize(env.BARDO_AUTH_INTROSPECTION_URL),
			"BARDO_AUTH_INTROSPECTION_URL",
			errors,
		);
	}

	if (
		normalize(env.BARDO_MCP_TRANSPORT_MODE) === "stateless" &&
		normalize(env.BARDO_MCP_ENABLE_JSON_RESPONSE) !== "true"
	) {
		errors.push(
			"BARDO_MCP_ENABLE_JSON_RESPONSE must be true when BARDO_MCP_TRANSPORT_MODE=stateless",
		);
	}

	if (!normalize(env.BARDO_MCP_TRANSPORT_MODE)) {
		warnings.push(
			"BARDO_MCP_TRANSPORT_MODE is not set; set it to stateless to match the hardened V1 path during development.",
		);
	} else if (normalize(env.BARDO_MCP_TRANSPORT_MODE) !== "stateless") {
		warnings.push(
			"BARDO_MCP_TRANSPORT_MODE should be stateless during development to mirror staging and production.",
		);
	}

	if (normalize(env.BARDO_GUIDED_SETUP_ENABLED) === "false") {
		errors.push(
			"BARDO_GUIDED_SETUP_ENABLED must not be false during development; guided setup is part of the current V1 contract",
		);
	}

	if (normalize(env.BARDO_SETUP_CONTRACT_V2_REQUIRED) === "false") {
		errors.push(
			"BARDO_SETUP_CONTRACT_V2_REQUIRED must not be false during development; setup contract v2 is now the default V1 path",
		);
	}

	const explicitHost = normalize(env.BARDO_HOST);
	if (explicitHost && !isLocalHostValue(explicitHost)) {
		errors.push("BARDO_HOST should stay on localhost during development");
	}

	if (!normalize(env.BARDO_AUTH_PROVIDER)) {
		warnings.push(
			"BARDO_AUTH_PROVIDER is not set; development will rely on the default auth path.",
		);
	}

	return { errors, warnings };
}
