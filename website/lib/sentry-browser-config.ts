import {
	defaultSampleRate,
	normalizeString,
	parseSampleRate,
} from "./sentry-shared";

type BrowserSentryEnv = Partial<
	Record<
		| "NODE_ENV"
		| "NEXT_PUBLIC_SENTRY_DSN"
		| "NEXT_PUBLIC_SENTRY_ENVIRONMENT"
		| "NEXT_PUBLIC_SENTRY_RELEASE"
		| "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
		string | undefined
	>
>;

function resolveBrowserSentryEnvironment(
	env: BrowserSentryEnv = process.env,
): string | undefined {
	return (
		normalizeString(env.NEXT_PUBLIC_SENTRY_ENVIRONMENT) ??
		(env.NODE_ENV === "development" ? "development" : undefined)
	);
}

export function getBrowserSentryConfigWarning(
	env: BrowserSentryEnv = process.env,
): string | undefined {
	const dsn = normalizeString(env.NEXT_PUBLIC_SENTRY_DSN);
	if (!dsn || env.NODE_ENV === "development") {
		return undefined;
	}
	if (resolveBrowserSentryEnvironment(env)) {
		return undefined;
	}
	return "Browser Sentry is disabled until NEXT_PUBLIC_SENTRY_ENVIRONMENT is set for this deployment.";
}

export function createBrowserSentryOptions(
	env: BrowserSentryEnv = process.env,
) {
	const dsn = normalizeString(env.NEXT_PUBLIC_SENTRY_DSN);
	const environment = resolveBrowserSentryEnvironment(env);
	const warning = getBrowserSentryConfigWarning(env);

	return {
		dsn,
		enabled: Boolean(dsn) && !warning,
		environment,
		// Let Sentry read window.SENTRY_RELEASE.id unless an explicit public override is provided.
		release: normalizeString(env.NEXT_PUBLIC_SENTRY_RELEASE),
		tracesSampleRate: parseSampleRate(
			env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
			defaultSampleRate(env.NODE_ENV),
		),
		enableLogs: true,
		sendDefaultPii: false,
	};
}
