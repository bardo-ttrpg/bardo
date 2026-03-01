import * as Sentry from "@sentry/bun";

type SentryEnv = Partial<
	Record<
		| "NODE_ENV"
		| "SENTRY_DSN"
		| "SENTRY_ENVIRONMENT"
		| "SENTRY_RELEASE"
		| "BARDO_SENTRY_ENABLED"
		| "BARDO_SENTRY_TRACES_SAMPLE_RATE"
		| "RAILWAY_GIT_COMMIT_SHA"
		| "VERCEL_GIT_COMMIT_SHA"
		| "GITHUB_SHA"
		| "SOURCE_VERSION"
		| "COMMIT_SHA",
		string | undefined
	>
>;

type SentryLoggerLike = {
	info?(
		message: string,
		attributes?: Record<string, string | number | boolean>,
	): void;
	warn?(
		message: string,
		attributes?: Record<string, string | number | boolean>,
	): void;
	error?(
		message: string,
		attributes?: Record<string, string | number | boolean>,
	): void;
};

type SentrySdkLike = {
	init?: (options: Record<string, unknown>) => void;
	wrapMcpServerWithSentry?: <Server>(server: Server) => Server;
	logger?: SentryLoggerLike;
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return fallback;
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

function normalizeString(value: string | undefined): string | undefined {
	const normalized = value?.trim();
	return normalized ? normalized : undefined;
}

export function resolveSentryRelease(
	env: SentryEnv = process.env,
): string | undefined {
	return (
		normalizeString(env.SENTRY_RELEASE) ??
		normalizeString(env.RAILWAY_GIT_COMMIT_SHA) ??
		normalizeString(env.VERCEL_GIT_COMMIT_SHA) ??
		normalizeString(env.GITHUB_SHA) ??
		normalizeString(env.SOURCE_VERSION) ??
		normalizeString(env.COMMIT_SHA)
	);
}

function sentryEnabled(env: SentryEnv = process.env): boolean {
	return (
		parseBoolean(env.BARDO_SENTRY_ENABLED, true) &&
		Boolean(normalizeString(env.SENTRY_DSN))
	);
}

export function initSentry(
	options: { env?: SentryEnv; sdk?: SentrySdkLike } = {},
): void {
	const env = options.env ?? process.env;
	const sdk = options.sdk ?? (Sentry as unknown as SentrySdkLike);
	const enabled = sentryEnabled(env);
	const dsn = normalizeString(env.SENTRY_DSN);
	if (!enabled || !dsn) {
		return;
	}

	sdk.init?.({
		dsn,
		environment: normalizeString(env.SENTRY_ENVIRONMENT) ?? env.NODE_ENV,
		release: resolveSentryRelease(env),
		tracesSampleRate: parseSampleRate(
			env.BARDO_SENTRY_TRACES_SAMPLE_RATE,
			env.NODE_ENV === "production" ? 0.1 : 1,
		),
		enableLogs: true,
		sendDefaultPii: false,
	});
}

export function logSentryMessage(
	level: "info" | "warn" | "error",
	message: string,
	attributes: Record<string, string | number | boolean> = {},
	options: { env?: SentryEnv; sdk?: SentrySdkLike } = {},
): void {
	const env = options.env ?? process.env;
	const sdk = options.sdk ?? (Sentry as unknown as SentrySdkLike);
	if (!sentryEnabled(env)) {
		return;
	}
	const logger = sdk.logger;
	const method = logger?.[level];
	if (!method) {
		return;
	}
	method.call(logger, message, attributes);
}

export function maybeWrapMcpServerWithSentry<Server>(
	server: Server,
	options: {
		enabled?: boolean;
		dsn?: string;
		wrapServer?: (server: Server) => Server;
	} = {},
): Server {
	const env = process.env;
	const enabled = options.enabled ?? sentryEnabled(env);
	const dsn = options.dsn ?? normalizeString(env.SENTRY_DSN);
	if (!enabled || !dsn) {
		return server;
	}

	const wrapServer =
		options.wrapServer ??
		((candidate: Server) =>
			Sentry.wrapMcpServerWithSentry(candidate as never) as Server);

	return wrapServer(server);
}
