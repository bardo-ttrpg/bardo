type DeployEnvValidationResult = {
	skipped: boolean;
	errors: string[];
	warnings: string[];
};

function normalize(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
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
		errors.push(`${label} must be false in production`);
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
		errors.push(`${label} must start with ${prefix} for production`);
	}
}

export function isProductionDeploy(
	env: Record<string, string | undefined>,
): boolean {
	return env.VERCEL_ENV === "production";
}

export function shouldEnforce(
	env: Record<string, string | undefined>,
): boolean {
	return env.BARDO_ENFORCE_LIVE_CLERK_KEYS === "true";
}

export function validateDeployEnv(
	env: Record<string, string | undefined>,
): DeployEnvValidationResult {
	if (!isProductionDeploy(env)) {
		return {
			skipped: true,
			errors: [],
			warnings: [],
		};
	}

	const errors: string[] = [];
	const warnings: string[] = [];

	requirePrefix(
		normalize(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
		"pk_live_",
		"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
		errors,
	);
	requirePrefix(
		normalize(env.CLERK_SECRET_KEY),
		"sk_live_",
		"CLERK_SECRET_KEY",
		errors,
	);

	if (!normalize(env.BARDO_BRIDGE_LOGIN_SECRET)) {
		errors.push("BARDO_BRIDGE_LOGIN_SECRET is missing");
	}
	if (!normalize(env.BARDO_WEBSITE_BACKEND_SQLITE_PATH)) {
		errors.push("BARDO_WEBSITE_BACKEND_SQLITE_PATH is missing");
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
			"BARDO_WORKSPACE_ROOT_ALLOWLIST is required when BARDO_ALLOW_WORKSPACE_ROOT_OVERRIDE=true in production",
		);
	}

	return {
		skipped: false,
		errors,
		warnings,
	};
}
