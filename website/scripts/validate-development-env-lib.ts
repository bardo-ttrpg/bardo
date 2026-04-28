type ValidationResult = {
	errors: string[];
	warnings: string[];
};

function normalize(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function isExplicitFalse(value: string | undefined): boolean {
	return normalize(value) === "false";
}

function usesBlobBackend(env: Record<string, string | undefined>): boolean {
	const driver = normalize(env.BARDO_WEBSITE_BACKEND_DRIVER)?.toLowerCase();
	return driver === "blob" && Boolean(normalize(env.BLOB_READ_WRITE_TOKEN));
}

function usesConvexBackend(env: Record<string, string | undefined>): boolean {
	const driver = normalize(env.BARDO_WEBSITE_BACKEND_DRIVER)?.toLowerCase();
	return (
		driver === "convex" &&
		Boolean(
			(normalize(env.CONVEX_URL) || normalize(env.NEXT_PUBLIC_CONVEX_URL)) &&
				normalize(env.BARDO_CONVEX_BACKEND_SECRET),
		)
	);
}

function validateLocalUrl(
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

export function validateDevelopmentEnv(
	env: Record<string, string | undefined>,
): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (normalize(env.NODE_ENV) === "production") {
		errors.push("NODE_ENV must not be production for development validation");
	}

	validateLocalUrl(
		normalize(env.NEXT_PUBLIC_APP_URL),
		"NEXT_PUBLIC_APP_URL",
		errors,
	);

	const backendPath = normalize(env.BARDO_WEBSITE_BACKEND_SQLITE_PATH);
	const hasDurableBackend =
		Boolean(backendPath) || usesBlobBackend(env) || usesConvexBackend(env);
	const needsDurableBackend =
		isExplicitFalse(env.BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK) ||
		isExplicitFalse(env.BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK) ||
		isExplicitFalse(env.BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK);

	if (!hasDurableBackend && needsDurableBackend) {
		errors.push(
			"BARDO_WEBSITE_BACKEND_SQLITE_PATH is required when development memory fallbacks are disabled",
		);
	}

	if (!hasDurableBackend) {
		warnings.push(
			"BARDO_WEBSITE_BACKEND_SQLITE_PATH is not set; development will rely on memory fallbacks where allowed.",
		);
	}

	if (
		normalize(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)?.startsWith("pk_live_")
	) {
		warnings.push(
			"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY uses a live key prefix; avoid production Clerk keys in development.",
		);
	}
	if (normalize(env.CLERK_SECRET_KEY)?.startsWith("sk_live_")) {
		warnings.push(
			"CLERK_SECRET_KEY uses a live key prefix; avoid production Clerk keys in development.",
		);
	}

	return { errors, warnings };
}
