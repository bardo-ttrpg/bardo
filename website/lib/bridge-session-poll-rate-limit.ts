import {
	createRequestRateLimiter,
	type RequestRateLimitBudget,
} from "./request-rate-limit";

type CreateRateLimiterOptions = {
	nowMs?: () => number;
	env?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
};

function createBridgeSessionPollRateLimiter(
	options: CreateRateLimiterOptions = {},
) {
	const env = options.env ?? process.env;
	return createRequestRateLimiter({
		...options,
		env,
		defaultLimit: 60,
		defaultWindowMs: 60_000,
		defaultAllowMemoryFallback: env.NODE_ENV !== "production",
		limitEnvName: "BARDO_BRIDGE_SESSION_POLL_MAX_PER_WINDOW",
		windowEnvName: "BARDO_BRIDGE_SESSION_POLL_WINDOW_MS",
		allowMemoryFallbackEnvName:
			"BARDO_BRIDGE_SESSION_POLL_ALLOW_MEMORY_FALLBACK",
		keyPrefix: "bardo:connect:bridge-session:poll",
		unavailableMessage: "Bridge session poll limiter is unavailable.",
	});
}

let defaultBridgeSessionPollRateLimiter: ReturnType<
	typeof createBridgeSessionPollRateLimiter
> | null = null;

export function getDefaultBridgeSessionPollRateLimiter(): {
	consume(request: Request): Promise<RequestRateLimitBudget>;
} {
	defaultBridgeSessionPollRateLimiter ??= createBridgeSessionPollRateLimiter();
	return defaultBridgeSessionPollRateLimiter;
}
