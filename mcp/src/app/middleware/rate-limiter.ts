type Bucket = {
	windowStartMs: number;
	requestCount: number;
};

type RateLimiterOptions = {
	windowMs: number;
	maxRequests: number;
};

type RateLimitResult = {
	allowed: boolean;
	retryAfterMs: number;
	limit: number;
	remaining: number;
	reset: number;
};

type RateLimiterProvider = {
	consume: (
		key: string,
		now?: number,
	) => RateLimitResult | Promise<RateLimitResult>;
};

export class InMemoryRateLimiter implements RateLimiterProvider {
	private readonly buckets = new Map<string, Bucket>();

	constructor(private readonly options: RateLimiterOptions) {}

	consume(key: string, now = Date.now()): RateLimitResult {
		const { maxRequests, windowMs } = this.options;
		if (maxRequests <= 0 || windowMs <= 0) {
			return {
				allowed: true,
				retryAfterMs: 0,
				limit: maxRequests,
				remaining: maxRequests,
				reset: now,
			};
		}

		const existing = this.buckets.get(key);
		if (!existing || now - existing.windowStartMs >= windowMs) {
			this.buckets.set(key, { windowStartMs: now, requestCount: 1 });
			return {
				allowed: true,
				retryAfterMs: 0,
				limit: maxRequests,
				remaining: Math.max(0, maxRequests - 1),
				reset: now + windowMs,
			};
		}

		if (existing.requestCount >= maxRequests) {
			const retryAfterMs = Math.max(
				0,
				windowMs - (now - existing.windowStartMs),
			);
			return {
				allowed: false,
				retryAfterMs,
				limit: maxRequests,
				remaining: 0,
				reset: existing.windowStartMs + windowMs,
			};
		}

		existing.requestCount += 1;
		return {
			allowed: true,
			retryAfterMs: 0,
			limit: maxRequests,
			remaining: Math.max(0, maxRequests - existing.requestCount),
			reset: existing.windowStartMs + windowMs,
		};
	}
}

type CreateRateLimiterOptions = RateLimiterOptions & {
	failClosed: boolean;
};

export function createRateLimiter(
	options: CreateRateLimiterOptions,
	_env: Record<string, string | undefined> = Bun.env,
): { kind: "memory"; limiter: RateLimiterProvider } {
	return {
		kind: "memory",
		limiter: new InMemoryRateLimiter({
			windowMs: options.windowMs,
			maxRequests: options.maxRequests,
		}),
	};
}
