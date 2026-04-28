type ValidationResult = {
	errors: string[];
	warnings: string[];
};

function normalize(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function _requireExact(
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

function requireFalse(
	value: string | undefined,
	label: string,
	errors: string[],
) {
	const normalized = normalize(value);
	if (!normalized) {
		return;
	}
	if (normalized !== "false") {
		errors.push(`${label} must be false for staging`);
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

function backendDriver(
	env: Record<string, string | undefined>,
): "blob" | "convex" | "file" | null {
	const configured = normalize(env.BARDO_WEBSITE_BACKEND_DRIVER)?.toLowerCase();
	if (
		configured === "blob" ||
		configured === "convex" ||
		configured === "file"
	) {
		return configured;
	}
	if (normalize(env.CONVEX_URL) || normalize(env.NEXT_PUBLIC_CONVEX_URL)) {
		return "convex";
	}
	if (normalize(env.BLOB_READ_WRITE_TOKEN)) {
		return "blob";
	}
	if (normalize(env.BARDO_WEBSITE_BACKEND_SQLITE_PATH)) {
		return "file";
	}
	return null;
}

export function validateStagingEnv(
	env: Record<string, string | undefined>,
): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	_requireExact(normalize(env.NODE_ENV), "production", "NODE_ENV", errors);

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

	if (!normalize(env.BARDO_AUTH_INTROSPECTION_TOKEN)) {
		errors.push("BARDO_AUTH_INTROSPECTION_TOKEN is missing");
	}
	if (!normalize(env.BARDO_BRIDGE_LOGIN_SECRET)) {
		errors.push("BARDO_BRIDGE_LOGIN_SECRET is missing");
	}
	const driver = backendDriver(env);
	if (driver === "convex") {
		requireHttpsUrl(
			normalize(env.CONVEX_URL) ?? normalize(env.NEXT_PUBLIC_CONVEX_URL),
			"CONVEX_URL or NEXT_PUBLIC_CONVEX_URL",
			errors,
		);
		if (!normalize(env.BARDO_CONVEX_BACKEND_SECRET)) {
			errors.push("BARDO_CONVEX_BACKEND_SECRET is missing");
		}
	} else if (driver === "blob") {
		if (!normalize(env.BLOB_READ_WRITE_TOKEN)) {
			errors.push("BLOB_READ_WRITE_TOKEN is missing");
		}
	} else if (driver === "file") {
		if (!normalize(env.BARDO_WEBSITE_BACKEND_SQLITE_PATH)) {
			errors.push("BARDO_WEBSITE_BACKEND_SQLITE_PATH is missing");
		}
	} else {
		errors.push(
			"CONVEX_URL, NEXT_PUBLIC_CONVEX_URL, BLOB_READ_WRITE_TOKEN, or BARDO_WEBSITE_BACKEND_SQLITE_PATH is missing",
		);
	}
	requireFalse(
		env.BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK,
		"BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK",
		errors,
	);
	requireFalse(
		env.BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK,
		"BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK",
		errors,
	);
	requireFalse(
		env.BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK,
		"BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK",
		errors,
	);
	if (
		normalize(env.BARDO_ALLOW_WORKSPACE_ROOT_OVERRIDE) === "true" &&
		!normalize(env.BARDO_WORKSPACE_ROOT_ALLOWLIST)
	) {
		errors.push(
			"BARDO_WORKSPACE_ROOT_ALLOWLIST is required when BARDO_ALLOW_WORKSPACE_ROOT_OVERRIDE=true for staging",
		);
	}

	return { errors, warnings };
}
