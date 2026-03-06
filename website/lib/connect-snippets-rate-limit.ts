import { BackendAvailabilityError } from "./backend-availability";

type ConsumeResult = {
	allowed: boolean;
	retryAfterSeconds?: number;
};

type CreateRateLimiterOptions = {
	nowMs?: () => number;
	env?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
};

type UpstashConfig = {
	url: string;
	token: string;
	timeoutMs: number;
};

type WindowCounter = {
	windowStartMs: number;
	used: number;
};

const CLEANUP_INTERVAL = 128;

export class ConnectSnippetsRateLimitError extends BackendAvailabilityError {
	constructor(message: string) {
		super({
			message,
			code: "upstash_unavailable",
		});
		this.name = "ConnectSnippetsRateLimitError";
	}
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return fallback;
}

function parsePositiveInteger(
	value: string | undefined,
	fallback: number,
): number {
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.floor(parsed);
}

function readUpstashConfig(
	env: Record<string, string | undefined>,
): UpstashConfig | null {
	const url = env.UPSTASH_REDIS_REST_URL?.trim();
	const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
	if (!url || !token) {
		return null;
	}
	return {
		url: url.replace(/\/+$/, ""),
		token,
		timeoutMs: parsePositiveInteger(env.BARDO_UPSTASH_TIMEOUT_MS, 1200),
	};
}

function resolveClientId(request: Request): string {
	const direct =
		request.headers.get("cf-connecting-ip")?.trim() ||
		request.headers.get("x-real-ip")?.trim();
	if (direct) {
		return direct;
	}

	const forwarded = request.headers.get("x-forwarded-for")?.trim();
	if (forwarded) {
		return forwarded.split(",")[0]?.trim() || "anonymous";
	}

	return "anonymous";
}

function retryAfterSeconds(
	nowMs: number,
	windowStartMs: number,
	windowMs: number,
): number {
	return Math.max(1, Math.ceil((windowStartMs + windowMs - nowMs) / 1000));
}

async function upstashIncrement(args: {
	config: UpstashConfig;
	fetchImpl: typeof fetch;
	key: string;
}): Promise<number | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), args.config.timeoutMs);
	try {
		const response = await args.fetchImpl(
			`${args.config.url}/incr/${encodeURIComponent(args.key)}`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${args.config.token}`,
				},
				signal: controller.signal,
			},
		);
		if (!response.ok) {
			return null;
		}
		const payload = (await response.json()) as { result?: unknown };
		return typeof payload.result === "number"
			? Math.floor(payload.result)
			: null;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

async function upstashEnsureExpiry(args: {
	config: UpstashConfig;
	fetchImpl: typeof fetch;
	key: string;
	ttlSeconds: number;
}): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), args.config.timeoutMs);
	try {
		const response = await args.fetchImpl(
			`${args.config.url}/expire/${encodeURIComponent(args.key)}/${args.ttlSeconds}`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${args.config.token}`,
				},
				signal: controller.signal,
			},
		);
		return response.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

export function createConnectSnippetsRateLimiter(
	options: CreateRateLimiterOptions = {},
) {
	const now = options.nowMs ?? (() => Date.now());
	const env = options.env ?? process.env;
	const fetchImpl = options.fetchImpl ?? fetch;
	const limit = parsePositiveInteger(
		env.BARDO_CONNECT_SNIPPETS_MAX_PER_WINDOW,
		60,
	);
	const windowMs = parsePositiveInteger(
		env.BARDO_CONNECT_SNIPPETS_WINDOW_MS,
		60_000,
	);
	const allowMemoryFallback = parseBoolean(
		env.BARDO_CONNECT_SNIPPETS_ALLOW_MEMORY_FALLBACK,
		env.NODE_ENV !== "production",
	);
	const upstash = readUpstashConfig(env);
	const counters = new Map<string, WindowCounter>();
	const ttlConfirmed = new Map<string, number>();
	let callsSinceCleanup = 0;

	function maybePrune(currentMs: number) {
		callsSinceCleanup += 1;
		if (callsSinceCleanup % CLEANUP_INTERVAL !== 0) {
			return;
		}
		for (const [clientId, counter] of counters) {
			if (counter.windowStartMs + windowMs <= currentMs) {
				counters.delete(clientId);
			}
		}
		for (const [key, expiresAt] of ttlConfirmed) {
			if (expiresAt <= currentMs) {
				ttlConfirmed.delete(key);
			}
		}
	}

	async function consume(request: Request): Promise<ConsumeResult> {
		const clientId = resolveClientId(request);
		const currentMs = now();
		const windowStartMs = Math.floor(currentMs / windowMs) * windowMs;
		const key = `bardo:connect:snippets:${clientId}:${windowStartMs}`;
		maybePrune(currentMs);

		if (upstash) {
			const used = await upstashIncrement({
				config: upstash,
				fetchImpl,
				key,
			});
			if (used !== null) {
				const ttlExpiresAt = ttlConfirmed.get(key) ?? 0;
				if (ttlExpiresAt <= currentMs) {
					const ensured = await upstashEnsureExpiry({
						config: upstash,
						fetchImpl,
						key,
						ttlSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
					});
					if (ensured) {
						ttlConfirmed.set(key, windowStartMs + windowMs);
					}
				}
				return used <= limit
					? { allowed: true }
					: {
							allowed: false,
							retryAfterSeconds: retryAfterSeconds(
								currentMs,
								windowStartMs,
								windowMs,
							),
						};
			}
		}

		if (!allowMemoryFallback) {
			throw new ConnectSnippetsRateLimitError(
				"Connect snippets limiter is unavailable.",
			);
		}

		const existing = counters.get(clientId);
		const counter =
			existing && existing.windowStartMs === windowStartMs
				? existing
				: { windowStartMs, used: 0 };
		counter.used += 1;
		counters.set(clientId, counter);

		return counter.used <= limit
			? { allowed: true }
			: {
					allowed: false,
					retryAfterSeconds: retryAfterSeconds(
						currentMs,
						windowStartMs,
						windowMs,
					),
				};
	}

	return {
		consume,
	};
}

let defaultLimiter: ReturnType<typeof createConnectSnippetsRateLimiter> | null =
	null;

export function getDefaultConnectSnippetsRateLimiter() {
	defaultLimiter ??= createConnectSnippetsRateLimiter();
	return defaultLimiter;
}
