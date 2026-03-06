import { describe, expect, test } from "bun:test";
import {
	CliSessionStartRateLimitError,
	createCliSessionStartRateLimiter,
} from "./cli-session-start-rate-limit";

function requestFromIp(ip: string): Request {
	return new Request("https://app.bardo.ai/api/connect/cli-session/start", {
		headers: {
			"x-forwarded-for": `${ip}, 10.0.0.1`,
		},
	});
}

describe("createCliSessionStartRateLimiter", () => {
	test("enforces window limits with in-memory fallback", async () => {
		let nowMs = 100;
		const limiter = createCliSessionStartRateLimiter({
			nowMs: () => nowMs,
			env: {
				BARDO_CLI_SESSION_START_MAX_PER_WINDOW: "2",
				BARDO_CLI_SESSION_START_WINDOW_MS: "1000",
				BARDO_CLI_SESSION_START_ALLOW_MEMORY_FALLBACK: "true",
				NODE_ENV: "production",
			},
		});
		const request = requestFromIp("203.0.113.11");

		expect(await limiter.consume(request)).toEqual({ allowed: true });
		expect(await limiter.consume(request)).toEqual({ allowed: true });
		expect(await limiter.consume(request)).toEqual({
			allowed: false,
			retryAfterSeconds: 1,
		});

		nowMs = 1_150;
		expect(await limiter.consume(request)).toEqual({ allowed: true });
	});

	test("throws a backend-availability error when Upstash is unavailable and memory fallback is disabled", async () => {
		const limiter = createCliSessionStartRateLimiter({
			env: {
				UPSTASH_REDIS_REST_URL: "https://upstash.example.com",
				UPSTASH_REDIS_REST_TOKEN: "token",
				BARDO_CLI_SESSION_START_ALLOW_MEMORY_FALLBACK: "false",
				NODE_ENV: "production",
			},
			fetchImpl: async () =>
				new Response("upstash unavailable", { status: 503 }),
		});

		await expect(
			limiter.consume(requestFromIp("203.0.113.21")),
		).rejects.toBeInstanceOf(CliSessionStartRateLimitError);
	});

	test("handles burst traffic deterministically in a single window", async () => {
		const limiter = createCliSessionStartRateLimiter({
			nowMs: () => 500,
			env: {
				BARDO_CLI_SESSION_START_MAX_PER_WINDOW: "100",
				BARDO_CLI_SESSION_START_WINDOW_MS: "60000",
				BARDO_CLI_SESSION_START_ALLOW_MEMORY_FALLBACK: "true",
				NODE_ENV: "production",
			},
		});
		const request = requestFromIp("203.0.113.31");
		const results = await Promise.all(
			Array.from({ length: 500 }, () => limiter.consume(request)),
		);
		const allowedCount = results.filter((entry) => entry.allowed).length;
		const rejectedCount = results.filter((entry) => !entry.allowed).length;

		expect(allowedCount).toBe(100);
		expect(rejectedCount).toBe(400);
	});

	test("confirms Upstash expiry once per key window", async () => {
		let increment = 0;
		let expireCalls = 0;
		const limiter = createCliSessionStartRateLimiter({
			nowMs: () => 1_000,
			env: {
				UPSTASH_REDIS_REST_URL: "https://upstash.example.com",
				UPSTASH_REDIS_REST_TOKEN: "token",
				BARDO_CLI_SESSION_START_MAX_PER_WINDOW: "10",
				BARDO_CLI_SESSION_START_WINDOW_MS: "60000",
				BARDO_CLI_SESSION_START_ALLOW_MEMORY_FALLBACK: "false",
				NODE_ENV: "production",
			},
			fetchImpl: async (input) => {
				const url = String(input);
				if (url.includes("/incr/")) {
					increment += 1;
					return new Response(JSON.stringify({ result: increment }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				if (url.includes("/expire/")) {
					expireCalls += 1;
					return new Response(JSON.stringify({ result: 1 }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				throw new Error(`Unexpected Upstash URL: ${url}`);
			},
		});
		const request = requestFromIp("203.0.113.41");

		expect(await limiter.consume(request)).toEqual({ allowed: true });
		expect(await limiter.consume(request)).toEqual({ allowed: true });
		expect(await limiter.consume(request)).toEqual({ allowed: true });
		expect(expireCalls).toBe(1);
	});

	test("refreshes Upstash expiry confirmation when the limiter window rolls over", async () => {
		let nowMs = 1_000;
		let increment = 0;
		let expireCalls = 0;
		const limiter = createCliSessionStartRateLimiter({
			nowMs: () => nowMs,
			env: {
				UPSTASH_REDIS_REST_URL: "https://upstash.example.com",
				UPSTASH_REDIS_REST_TOKEN: "token",
				BARDO_CLI_SESSION_START_MAX_PER_WINDOW: "10",
				BARDO_CLI_SESSION_START_WINDOW_MS: "1000",
				BARDO_CLI_SESSION_START_ALLOW_MEMORY_FALLBACK: "false",
				NODE_ENV: "production",
			},
			fetchImpl: async (input) => {
				const url = String(input);
				if (url.includes("/incr/")) {
					increment += 1;
					return new Response(JSON.stringify({ result: increment }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				if (url.includes("/expire/")) {
					expireCalls += 1;
					return new Response(JSON.stringify({ result: 1 }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				throw new Error(`Unexpected Upstash URL: ${url}`);
			},
		});
		const request = requestFromIp("203.0.113.51");

		expect(await limiter.consume(request)).toEqual({ allowed: true });
		expect(expireCalls).toBe(1);

		nowMs = 2_100;
		expect(await limiter.consume(request)).toEqual({ allowed: true });
		expect(expireCalls).toBe(2);
	});
});
