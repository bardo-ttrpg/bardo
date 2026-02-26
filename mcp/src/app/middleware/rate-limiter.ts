import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

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

type UpstashLimitResult = {
	success: boolean;
	limit: number;
	remaining: number;
	reset: number;
};

type UpstashLimiterClient = {
	limit: (key: string) => Promise<UpstashLimitResult>;
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

type UpstashRateLimiterOptions = RateLimiterOptions & {
	failClosed: boolean;
	upstashUrl?: string;
	upstashToken?: string;
	limiterClient?: UpstashLimiterClient;
};

function fixedWindowString(windowMs: number): `${number} s` {
	const seconds = Math.max(1, Math.ceil(windowMs / 1000));
	return `${seconds} s`;
}

export class UpstashRateLimiter implements RateLimiterProvider {
	private readonly limiter: UpstashLimiterClient;

	constructor(private readonly options: UpstashRateLimiterOptions) {
		if (options.limiterClient) {
			this.limiter = options.limiterClient;
			return;
		}

		if (!options.upstashUrl || !options.upstashToken) {
			throw new Error(
				"UpstashRateLimiter requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
			);
		}

		const redis = new Redis({
			url: options.upstashUrl,
			token: options.upstashToken,
		});
		this.limiter = new Ratelimit({
			redis,
			limiter: Ratelimit.fixedWindow(
				options.maxRequests,
				fixedWindowString(options.windowMs),
			),
			prefix: "bardo:rl",
		});
	}

	async consume(key: string, now = Date.now()): Promise<RateLimitResult> {
		try {
			const result = await this.limiter.limit(key);
			return {
				allowed: result.success,
				retryAfterMs: result.success ? 0 : Math.max(0, result.reset - now),
				limit: result.limit,
				remaining: Math.max(0, result.remaining),
				reset: result.reset,
			};
		} catch {
			if (!this.options.failClosed) {
				return {
					allowed: true,
					retryAfterMs: 0,
					limit: this.options.maxRequests,
					remaining: this.options.maxRequests,
					reset: now + this.options.windowMs,
				};
			}

			return {
				allowed: false,
				retryAfterMs: this.options.windowMs,
				limit: this.options.maxRequests,
				remaining: 0,
				reset: now + this.options.windowMs,
			};
		}
	}
}

type CreateRateLimiterOptions = RateLimiterOptions & {
	failClosed: boolean;
};

export function createRateLimiter(
	options: CreateRateLimiterOptions,
	env: Record<string, string | undefined> = Bun.env,
): { kind: "memory" | "upstash"; limiter: RateLimiterProvider } {
	const upstashUrl = env.UPSTASH_REDIS_REST_URL?.trim();
	const upstashToken = env.UPSTASH_REDIS_REST_TOKEN?.trim();
	if (upstashUrl && upstashToken) {
		return {
			kind: "upstash",
			limiter: new UpstashRateLimiter({
				windowMs: options.windowMs,
				maxRequests: options.maxRequests,
				failClosed: options.failClosed,
				upstashUrl,
				upstashToken,
			}),
		};
	}

	return {
		kind: "memory",
		limiter: new InMemoryRateLimiter({
			windowMs: options.windowMs,
			maxRequests: options.maxRequests,
		}),
	};
}
