type DeployEnvValidationResult = {
	skipped: boolean;
	errors: string[];
	warnings: string[];
};

function normalize(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
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

	if (!normalize(env.BARDO_CLI_LOGIN_SECRET)) {
		errors.push("BARDO_CLI_LOGIN_SECRET is missing");
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

	if (!upstashUrl || !upstashToken) {
		errors.push(
			"Production CLI device sessions require Upstash REST URL and token.",
		);
	}
	if (upstashDatabase !== "bardo-production") {
		errors.push(
			"Production CLI device sessions must use the bardo-production Upstash database.",
		);
	}
	if (
		normalize(env.BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK) === "true"
	) {
		errors.push(
			"BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK must be false in production.",
		);
	}

	if (!normalize(env.SENTRY_DSN)) {
		warnings.push(
			"SENTRY_DSN is missing; production connect-flow failures will have reduced observability.",
		);
	}

	return {
		skipped: false,
		errors,
		warnings,
	};
}
