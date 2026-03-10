import {
	createRequestRateLimiter,
	type RequestRateLimitBudget,
} from "./request-rate-limit";

type CreateRateLimiterOptions = {
	nowMs?: () => number;
	env?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
};

export function createCliExchangeRateLimiter(
	options: CreateRateLimiterOptions = {},
) {
	return createRequestRateLimiter({
		...options,
		defaultLimit: 20,
		defaultWindowMs: 60_000,
		defaultAllowMemoryFallback: options.env?.NODE_ENV !== "production",
		limitEnvName: "BARDO_CLI_EXCHANGE_MAX_PER_WINDOW",
		windowEnvName: "BARDO_CLI_EXCHANGE_WINDOW_MS",
		allowMemoryFallbackEnvName: "BARDO_CLI_EXCHANGE_ALLOW_MEMORY_FALLBACK",
		keyPrefix: "bardo:connect:cli-exchange",
		unavailableMessage: "CLI exchange limiter is unavailable.",
	});
}

let defaultCliExchangeRateLimiter: ReturnType<
	typeof createCliExchangeRateLimiter
> | null = null;

export function getDefaultCliExchangeRateLimiter(): {
	consume(request: Request): Promise<RequestRateLimitBudget>;
} {
	defaultCliExchangeRateLimiter ??= createCliExchangeRateLimiter();
	return defaultCliExchangeRateLimiter;
}
