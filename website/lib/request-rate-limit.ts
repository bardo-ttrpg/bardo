import { BackendAvailabilityError } from "./backend-availability";
import { createWebsiteBackendClient } from "./website-backend";

export type RequestRateLimitBudget = {
	allowed: boolean;
	retryAfterSeconds?: number;
	limit?: number;
	remaining?: number;
	resetEpochSeconds?: number;
};

type CreateRequestRateLimiterOptions = {
	nowMs?: () => number;
	env?: Record<string, string | undefined>;
	defaultLimit: number;
	defaultWindowMs: number;
	defaultAllowMemoryFallback: boolean;
	limitEnvName: string;
	windowEnvName: string;
	allowMemoryFallbackEnvName: string;
	keyPrefix: string;
	unavailableMessage: string;
	websiteBackend?: {
		consumeRateLimitWindow(args: {
			scope: string;
			counterKey: string;
			limit: number;
			windowMs: number;
			nowMs?: number;
		}): Promise<RequestRateLimitBudget>;
	} | null;
	controlPlane?: {
		consumeRateLimitWindow(args: {
			scope: string;
			counterKey: string;
			limit: number;
			windowMs: number;
			nowMs?: number;
		}): Promise<RequestRateLimitBudget>;
	} | null;
};

type WindowCounter = {
	windowStartMs: number;
	used: number;
};

const CLEANUP_INTERVAL = 128;

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

export function createRequestRateLimiter(
	options: CreateRequestRateLimiterOptions,
) {
	const now = options.nowMs ?? (() => Date.now());
	const env = options.env ?? process.env;
	const limit = parsePositiveInteger(
		env[options.limitEnvName],
		options.defaultLimit,
	);
	const windowMs = parsePositiveInteger(
		env[options.windowEnvName],
		options.defaultWindowMs,
	);
	const allowMemoryFallback = parseBoolean(
		env[options.allowMemoryFallbackEnvName],
		options.defaultAllowMemoryFallback,
	);
	const websiteBackend =
		options.websiteBackend !== undefined
			? options.websiteBackend
			: options.controlPlane === undefined
				? (() => {
						try {
							return createWebsiteBackendClient(env);
						} catch {
							return null;
						}
					})()
				: options.controlPlane;
	const counters = new Map<string, WindowCounter>();
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
	}

	async function consume(request: Request): Promise<RequestRateLimitBudget> {
		const clientId = resolveClientId(request);
		const currentMs = now();
		const windowStartMs = Math.floor(currentMs / windowMs) * windowMs;
		maybePrune(currentMs);

		if (websiteBackend) {
			try {
				return await websiteBackend.consumeRateLimitWindow({
					scope: options.keyPrefix,
					counterKey: clientId,
					limit,
					windowMs,
					nowMs: currentMs,
				});
			} catch {
				if (!allowMemoryFallback) {
					throw new BackendAvailabilityError({
						message: options.unavailableMessage,
						code: "website_backend_unavailable",
					});
				}
			}
		}

		if (!allowMemoryFallback) {
			throw new BackendAvailabilityError({
				message: options.unavailableMessage,
				code: "website_backend_unavailable",
			});
		}

		const existing = counters.get(clientId);
		const counter =
			existing && existing.windowStartMs === windowStartMs
				? existing
				: { windowStartMs, used: 0 };
		counter.used += 1;
		counters.set(clientId, counter);

		return counter.used <= limit
			? {
					allowed: true,
					limit,
					remaining: Math.max(0, limit - counter.used),
					resetEpochSeconds: Math.ceil((windowStartMs + windowMs) / 1000),
				}
			: {
					allowed: false,
					retryAfterSeconds: retryAfterSeconds(
						currentMs,
						windowStartMs,
						windowMs,
					),
					limit,
					remaining: 0,
					resetEpochSeconds: Math.ceil((windowStartMs + windowMs) / 1000),
				};
	}

	return {
		consume,
	};
}
