import { describe, expect, test } from "bun:test";
import {
	BridgeSessionStartRateLimitError,
	createBridgeSessionStartRateLimiter,
} from "./bridge-session-start-rate-limit";

function requestFromIp(ip: string): Request {
	return new Request("https://app.bardo.ai/api/connect/bridge-session/start", {
		headers: {
			"x-forwarded-for": `${ip}, 10.0.0.1`,
		},
	});
}

describe("createBridgeSessionStartRateLimiter", () => {
	test("enforces window limits with in-memory fallback", async () => {
		let nowMs = 100;
		const limiter = createBridgeSessionStartRateLimiter({
			nowMs: () => nowMs,
			env: {
				BARDO_BRIDGE_SESSION_START_MAX_PER_WINDOW: "2",
				BARDO_BRIDGE_SESSION_START_WINDOW_MS: "1000",
				BARDO_BRIDGE_SESSION_START_ALLOW_MEMORY_FALLBACK: "true",
				NODE_ENV: "production",
			},
		});
		const request = requestFromIp("203.0.113.11");

		expect(await limiter.consume(request)).toEqual({
			allowed: true,
			limit: 2,
			remaining: 1,
			resetEpochSeconds: 1,
		});
		expect(await limiter.consume(request)).toEqual({
			allowed: true,
			limit: 2,
			remaining: 0,
			resetEpochSeconds: 1,
		});
		expect(await limiter.consume(request)).toEqual({
			allowed: false,
			retryAfterSeconds: 1,
			limit: 2,
			remaining: 0,
			resetEpochSeconds: 1,
		});

		nowMs = 1_150;
		expect(await limiter.consume(request)).toEqual({
			allowed: true,
			limit: 2,
			remaining: 1,
			resetEpochSeconds: 2,
		});
	});

	test("throws a backend-availability error when the website backend is unavailable and memory fallback is disabled", async () => {
		const limiter = createBridgeSessionStartRateLimiter({
			env: {
				BARDO_BRIDGE_SESSION_START_ALLOW_MEMORY_FALLBACK: "false",
				NODE_ENV: "production",
			},
			websiteBackend: {
				consumeRateLimitWindow: async () => {
					throw new Error("website backend unavailable");
				},
			},
		});

		await expect(
			limiter.consume(requestFromIp("203.0.113.21")),
		).rejects.toBeInstanceOf(BridgeSessionStartRateLimitError);
	});

	test("handles burst traffic deterministically in a single window", async () => {
		const limiter = createBridgeSessionStartRateLimiter({
			nowMs: () => 500,
			env: {
				BARDO_BRIDGE_SESSION_START_MAX_PER_WINDOW: "100",
				BARDO_BRIDGE_SESSION_START_WINDOW_MS: "60000",
				BARDO_BRIDGE_SESSION_START_ALLOW_MEMORY_FALLBACK: "true",
				NODE_ENV: "production",
			},
		});
		const request = requestFromIp("203.0.113.31");
		const results = await Promise.all(
			Array.from({ length: 500 }, () => limiter.consume(request)),
		);
		expect(results.filter((entry) => entry.allowed).length).toBe(100);
		expect(results.filter((entry) => !entry.allowed).length).toBe(400);
	});
});
