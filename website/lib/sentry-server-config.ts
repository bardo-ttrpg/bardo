import {
	defaultSampleRate,
	normalizeString,
	parseSampleRate,
} from "./sentry-shared";

type ServerSentryEnv = Partial<
	Record<
		| "NODE_ENV"
		| "SENTRY_DSN"
		| "SENTRY_ENVIRONMENT"
		| "SENTRY_RELEASE"
		| "SENTRY_TRACES_SAMPLE_RATE"
		| "VERCEL_GIT_COMMIT_SHA"
		| "RAILWAY_GIT_COMMIT_SHA"
		| "GITHUB_SHA"
		| "SOURCE_VERSION"
		| "COMMIT_SHA",
		string | undefined
	>
>;

export function resolveSentryRelease(
	env: ServerSentryEnv = process.env,
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

export function createServerSentryOptions(env: ServerSentryEnv = process.env) {
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
