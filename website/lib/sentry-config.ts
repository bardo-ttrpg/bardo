type SentryEnv = Partial<
	Record<
		| "NODE_ENV"
		| "SENTRY_DSN"
		| "NEXT_PUBLIC_SENTRY_DSN"
		| "SENTRY_ENVIRONMENT"
		| "SENTRY_RELEASE"
		| "SENTRY_TRACES_SAMPLE_RATE"
		| "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE"
		| "VERCEL_GIT_COMMIT_SHA"
		| "RAILWAY_GIT_COMMIT_SHA"
		| "GITHUB_SHA"
		| "SOURCE_VERSION"
		| "COMMIT_SHA",
		string | undefined
	>
>;

function normalizeString(value: string | undefined): string | undefined {
	const normalized = value?.trim();
	return normalized ? normalized : undefined;
}

function parseSampleRate(value: string | undefined, fallback: number): number {
	if (!value) {
		return fallback;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
		return fallback;
	}
	return parsed;
}

function defaultSampleRate(nodeEnv: string | undefined): number {
	return nodeEnv === "production" ? 0.1 : 1;
}

export function resolveSentryRelease(
	env: SentryEnv = process.env,
): string | undefined {
	return (
		normalizeString(env.SENTRY_RELEASE) ??
		normalizeString(env.VERCEL_GIT_COMMIT_SHA) ??
		normalizeString(env.RAILWAY_GIT_COMMIT_SHA) ??
		normalizeString(env.GITHUB_SHA) ??
		normalizeString(env.SOURCE_VERSION) ??
		normalizeString(env.COMMIT_SHA)
	);
}

export function createServerSentryOptions(env: SentryEnv = process.env) {
	return {
		dsn: normalizeString(env.SENTRY_DSN),
		enabled: Boolean(normalizeString(env.SENTRY_DSN)),
		environment: normalizeString(env.SENTRY_ENVIRONMENT) ?? env.NODE_ENV,
		release: resolveSentryRelease(env),
		tracesSampleRate: parseSampleRate(
			env.SENTRY_TRACES_SAMPLE_RATE,
			defaultSampleRate(env.NODE_ENV),
		),
		enableLogs: true,
		sendDefaultPii: false,
	};
}

export function createBrowserSentryOptions(env: SentryEnv = process.env) {
	return {
		dsn: normalizeString(env.NEXT_PUBLIC_SENTRY_DSN),
		enabled: Boolean(normalizeString(env.NEXT_PUBLIC_SENTRY_DSN)),
		environment: normalizeString(env.SENTRY_ENVIRONMENT) ?? env.NODE_ENV,
		release: resolveSentryRelease(env),
		tracesSampleRate: parseSampleRate(
			env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
			defaultSampleRate(env.NODE_ENV),
		),
		enableLogs: true,
		sendDefaultPii: false,
	};
}
