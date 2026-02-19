type Bucket = {
	windowStartMs: number;
	requestCount: number;
};

export type RateLimiterOptions = {
	windowMs: number;
	maxRequests: number;
};

export type RateLimitResult = {
	allowed: boolean;
	retryAfterMs: number;
};

export class RateLimiter {
	private readonly buckets = new Map<string, Bucket>();

	constructor(private readonly options: RateLimiterOptions) {}

	consume(key: string, now = Date.now()): RateLimitResult {
		const { maxRequests, windowMs } = this.options;
		if (maxRequests <= 0 || windowMs <= 0) {
			return { allowed: true, retryAfterMs: 0 };
		}

		const existing = this.buckets.get(key);
		if (!existing || now - existing.windowStartMs >= windowMs) {
			this.buckets.set(key, { windowStartMs: now, requestCount: 1 });
			return { allowed: true, retryAfterMs: 0 };
		}

		if (existing.requestCount >= maxRequests) {
			const retryAfterMs = Math.max(
				0,
				windowMs - (now - existing.windowStartMs),
			);
			return { allowed: false, retryAfterMs };
		}

		existing.requestCount += 1;
		return { allowed: true, retryAfterMs: 0 };
	}
}
