import { BackendAvailabilityError } from "./backend-availability";
import {
	createRequestRateLimiter,
	type RequestRateLimitBudget,
} from "./request-rate-limit";

type CreateRateLimiterOptions = {
	nowMs?: () => number;
	env?: Record<string, string | undefined>;
	websiteBackend?: {
		consumeRateLimitWindow(args: {
			scope: string;
			counterKey: string;
			limit: number;
			windowMs: number;
			nowMs?: number;
		}): Promise<RequestRateLimitBudget>;
	} | null;
};

export class BridgeSessionStartRateLimitError extends BackendAvailabilityError {
	constructor(message: string) {
		super({
			message,
			code: "website_backend_unavailable",
		});
		this.name = "BridgeSessionStartRateLimitError";
	}
}

export function createBridgeSessionStartRateLimiter(
	options: CreateRateLimiterOptions = {},
) {
	const env = options.env ?? process.env;
	const limiter = createRequestRateLimiter({
		nowMs: options.nowMs,
		env,
		websiteBackend: options.websiteBackend,
		defaultLimit: 10,
		defaultWindowMs: 60_000,
		defaultAllowMemoryFallback: env.NODE_ENV !== "production",
		limitEnvName: "BARDO_BRIDGE_SESSION_START_MAX_PER_WINDOW",
		windowEnvName: "BARDO_BRIDGE_SESSION_START_WINDOW_MS",
		allowMemoryFallbackEnvName:
			"BARDO_BRIDGE_SESSION_START_ALLOW_MEMORY_FALLBACK",
		keyPrefix: "connect:bridge-session:start",
		unavailableMessage: "Bridge session start limiter is unavailable.",
	});

	return {
		async consume(request: Request) {
			try {
				return await limiter.consume(request);
			} catch (error) {
				if (error instanceof BackendAvailabilityError) {
					throw new BridgeSessionStartRateLimitError(error.message);
				}
				throw error;
			}
		},
	};
}

let defaultLimiter: ReturnType<
	typeof createBridgeSessionStartRateLimiter
> | null = null;

export function getDefaultBridgeSessionStartRateLimiter() {
	defaultLimiter ??= createBridgeSessionStartRateLimiter();
	return defaultLimiter;
}
