type CheckReleaseHealthResult = {
	skipped: boolean;
	errors: string[];
	warnings: string[];
	release: string | undefined;
};

type ResolvedReleaseUrl = {
	value: string | undefined;
	source: "env" | "vercel-preview";
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
			errors.push(
				`${label} must not point to localhost in release environments`,
			);
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

function isPreviewRelease(env: Record<string, string | undefined>): boolean {
	return normalize(env.VERCEL_ENV)?.toLowerCase() === "preview";
}

function resolvePreviewDeploymentBaseUrl(
	env: Record<string, string | undefined>,
): string | undefined {
	const candidateHost =
		normalize(env.VERCEL_BRANCH_URL) ??
		normalize(env.VERCEL_URL) ??
		normalize(env.VERCEL_PROJECT_PRODUCTION_URL);
	if (!candidateHost) {
		return undefined;
	}

	if (/^https?:\/\//i.test(candidateHost)) {
		return candidateHost;
	}

	return `https://${candidateHost}`;
}

function resolveHttpsUrl(
	env: Record<string, string | undefined>,
	label: string,
	errors: string[],
	warnings: string[],
): ResolvedReleaseUrl {
	const explicitValue = normalize(env[label]);
	if (explicitValue) {
		const validatedValue = requireHttpsUrl(explicitValue, label, errors);
		return {
			value: validatedValue,
			source: "env",
		};
	}

	if (!isPreviewRelease(env)) {
		requireHttpsUrl(undefined, label, errors);
		return {
			value: undefined,
			source: "env",
		};
	}

	const previewValue = resolvePreviewDeploymentBaseUrl(env);
	if (!previewValue) {
		errors.push(
			`${label} is missing and no Vercel preview deployment URL is available`,
		);
		return {
			value: undefined,
			source: "vercel-preview",
		};
	}

	const validatedValue = requireHttpsUrl(previewValue, label, errors);
	if (validatedValue) {
		warnings.push(
			`${label} is missing; using Vercel preview deployment URL for release health`,
		);
	}
	return {
		value: validatedValue,
		source: "vercel-preview",
	};
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
	resolveHttpsUrl(env, "NEXT_PUBLIC_APP_URL", errors, warnings);
	resolveHttpsUrl(env, "BARDO_APP_BASE_URL", errors, warnings);
	resolveHttpsUrl(env, "BARDO_RUNTIME_STATUS_URL", errors, warnings);
	resolveHttpsUrl(
		env,
		"BARDO_BRIDGE_SESSION_REFRESH_URL",
		errors,
		warnings,
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
