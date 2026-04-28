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
			errors.push(`${label} must use https for production`);
		}
		if (
			url.hostname === "localhost" ||
			url.hostname === "127.0.0.1" ||
			url.hostname === "::1"
		) {
			errors.push(`${label} must not point to localhost for production`);
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

function isTmpPath(value: string): boolean {
	return value === "/tmp" || value.startsWith("/tmp/");
}

function isExplicitMemoryBackendFallback(
	env: Record<string, string | undefined>,
): boolean {
	return normalize(env.BARDO_WEBSITE_BACKEND_ALLOW_MEMORY_FALLBACK) === "true";
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
	requireHttpsUrl(
		normalize(env.NEXT_PUBLIC_APP_URL),
		"NEXT_PUBLIC_APP_URL",
		errors,
	);
	requireHttpsUrl(
		normalize(env.BARDO_APP_BASE_URL),
		"BARDO_APP_BASE_URL",
		errors,
	);
	requireHttpsUrl(
		normalize(env.BARDO_RUNTIME_STATUS_URL),
		"BARDO_RUNTIME_STATUS_URL",
		errors,
	);
	requireHttpsUrl(
		normalize(env.BARDO_BRIDGE_SESSION_REFRESH_URL),
		"BARDO_BRIDGE_SESSION_REFRESH_URL",
		errors,
	);

	if (!normalize(env.BARDO_BRIDGE_LOGIN_SECRET)) {
		errors.push("BARDO_BRIDGE_LOGIN_SECRET is missing");
	}
	const driver = backendDriver(env);
	const allowMemoryBackendFallback = isExplicitMemoryBackendFallback(env);
	if (allowMemoryBackendFallback) {
		warnings.push(
			"BARDO_WEBSITE_BACKEND_ALLOW_MEMORY_FALLBACK=true is temporary and not durable for production bridge sessions",
		);
	} else if (driver === "convex") {
		const convexUrl =
			normalize(env.CONVEX_URL) ?? normalize(env.NEXT_PUBLIC_CONVEX_URL);
		requireHttpsUrl(convexUrl, "CONVEX_URL or NEXT_PUBLIC_CONVEX_URL", errors);
		if (!normalize(env.BARDO_CONVEX_BACKEND_SECRET)) {
			errors.push("BARDO_CONVEX_BACKEND_SECRET is missing");
		}
	} else if (driver === "blob") {
		if (!normalize(env.BLOB_READ_WRITE_TOKEN)) {
			errors.push("BLOB_READ_WRITE_TOKEN is missing");
		}
	} else if (driver === "file") {
		const backendPath = normalize(env.BARDO_WEBSITE_BACKEND_SQLITE_PATH);
		if (!backendPath) {
			errors.push("BARDO_WEBSITE_BACKEND_SQLITE_PATH is missing");
		} else if (isTmpPath(backendPath)) {
			errors.push(
				"BARDO_WEBSITE_BACKEND_SQLITE_PATH must not use /tmp in production",
			);
		}
	} else {
		errors.push(
			"CONVEX_URL, NEXT_PUBLIC_CONVEX_URL, BLOB_READ_WRITE_TOKEN, or BARDO_WEBSITE_BACKEND_SQLITE_PATH is missing",
		);
	}
	if (!allowMemoryBackendFallback) {
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
	}
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
