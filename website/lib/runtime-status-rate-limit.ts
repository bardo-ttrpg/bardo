import {
	createRequestRateLimiter,
	type RequestRateLimitBudget,
} from "./request-rate-limit";

type CreateRateLimiterOptions = {
	nowMs?: () => number;
	env?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
};

function createRuntimeStatusRateLimiter(
	options: CreateRateLimiterOptions = {},
) {
	return createRequestRateLimiter({
		...options,
		defaultLimit: 120,
		defaultWindowMs: 60_000,
		defaultAllowMemoryFallback: options.env?.NODE_ENV !== "production",
		limitEnvName: "BARDO_RUNTIME_STATUS_MAX_PER_WINDOW",
		windowEnvName: "BARDO_RUNTIME_STATUS_WINDOW_MS",
		allowMemoryFallbackEnvName: "BARDO_RUNTIME_STATUS_ALLOW_MEMORY_FALLBACK",
		keyPrefix: "bardo:connect:runtime-status",
		unavailableMessage: "Runtime status limiter is unavailable.",
	});
}

let defaultRuntimeStatusRateLimiter: ReturnType<
	typeof createRuntimeStatusRateLimiter
> | null = null;

export function getDefaultRuntimeStatusRateLimiter(): {
	consume(request: Request): Promise<RequestRateLimitBudget>;
} {
	defaultRuntimeStatusRateLimiter ??= createRuntimeStatusRateLimiter();
	return defaultRuntimeStatusRateLimiter;
}
