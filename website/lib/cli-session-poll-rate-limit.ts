import {
	createRequestRateLimiter,
	type RequestRateLimitBudget,
} from "./request-rate-limit";

type CreateRateLimiterOptions = {
	nowMs?: () => number;
	env?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
};

export function createCliSessionPollRateLimiter(
	options: CreateRateLimiterOptions = {},
) {
	return createRequestRateLimiter({
		...options,
		defaultLimit: 60,
		defaultWindowMs: 60_000,
		defaultAllowMemoryFallback: options.env?.NODE_ENV !== "production",
		limitEnvName: "BARDO_CLI_SESSION_POLL_MAX_PER_WINDOW",
		windowEnvName: "BARDO_CLI_SESSION_POLL_WINDOW_MS",
		allowMemoryFallbackEnvName: "BARDO_CLI_SESSION_POLL_ALLOW_MEMORY_FALLBACK",
		keyPrefix: "bardo:connect:cli-session:poll",
		unavailableMessage: "CLI session poll limiter is unavailable.",
	});
}

let defaultCliSessionPollRateLimiter: ReturnType<
	typeof createCliSessionPollRateLimiter
> | null = null;

export function getDefaultCliSessionPollRateLimiter(): {
	consume(request: Request): Promise<RequestRateLimitBudget>;
} {
	defaultCliSessionPollRateLimiter ??= createCliSessionPollRateLimiter();
	return defaultCliSessionPollRateLimiter;
}
