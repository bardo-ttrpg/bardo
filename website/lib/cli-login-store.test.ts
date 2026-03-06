import { describe, expect, mock, test } from "bun:test";
import { createCliLoginTokenStore } from "./cli-login-store";

describe("cli login token store", () => {
	test("accepts the first token use and rejects a replay", async () => {
		const store = createCliLoginTokenStore({
			nowMs: () => Date.parse("2026-03-03T00:00:00.000Z"),
		});

		const first = await store.consume({
			token: "cli_token_a",
			expiresAtISO: "2026-03-03T00:05:00.000Z",
		});
		const second = await store.consume({
			token: "cli_token_a",
			expiresAtISO: "2026-03-03T00:05:00.000Z",
		});

		expect(first.ok).toBe(true);
		expect(second.ok).toBe(false);
		expect(second.reason).toBe("already_used");
	});

	test("rejects expired tokens before storing them", async () => {
		const store = createCliLoginTokenStore({
			nowMs: () => Date.parse("2026-03-03T00:05:00.000Z"),
		});

		const result = await store.consume({
			token: "cli_token_expired",
			expiresAtISO: "2026-03-03T00:04:59.000Z",
		});

		expect(result.ok).toBe(false);
		expect(result.reason).toBe("expired");
	});

	test("persists one-time token claims through Upstash NX semantics", async () => {
		const fetchImpl = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toContain("https://staging.upstash.io/set/");
				expect(String(input)).toContain("/NX/EX/300");
				expect(init?.headers).toEqual({
					authorization: "Bearer upstash-token",
				});
				return new Response(JSON.stringify({ result: "OK" }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		);
		const store = createCliLoginTokenStore({
			nowMs: () => Date.parse("2026-03-03T00:00:00.000Z"),
			env: {
				NODE_ENV: "development",
				BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "false",
				UPSTASH_REDIS_REST_URL: "https://staging.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "upstash-token",
				UPSTASH_REDIS_DATABASE_NAME: "bardo-staging",
			},
			fetchImpl,
		});

		const result = await store.consume({
			token: "cli_token_upstash",
			expiresAtISO: "2026-03-03T00:05:00.000Z",
		});

		expect(result.ok).toBe(true);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	test("rejects replays when Upstash returns a failed NX write", async () => {
		const fetchImpl = mock(
			async () =>
				new Response(JSON.stringify({ result: null }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
		);
		const store = createCliLoginTokenStore({
			nowMs: () => Date.parse("2026-03-03T00:00:00.000Z"),
			env: {
				NODE_ENV: "development",
				BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "false",
				UPSTASH_REDIS_REST_URL: "https://staging.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "upstash-token",
				UPSTASH_REDIS_DATABASE_NAME: "bardo-staging",
			},
			fetchImpl,
		});

		const result = await store.consume({
			token: "cli_token_upstash_replay",
			expiresAtISO: "2026-03-03T00:05:00.000Z",
		});

		expect(result.ok).toBe(false);
		expect(result.reason).toBe("already_used");
	});

	test("rejects non-production Upstash configs that do not target bardo-staging", async () => {
		const store = createCliLoginTokenStore({
			nowMs: () => Date.parse("2026-03-03T00:00:00.000Z"),
			env: {
				NODE_ENV: "development",
				BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "false",
				UPSTASH_REDIS_REST_URL: "https://production.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "upstash-token",
				UPSTASH_REDIS_DATABASE_NAME: "bardo-production",
			},
			fetchImpl: mock(async () => {
				throw new Error("fetch should not run");
			}),
		});

		await expect(
			store.consume({
				token: "cli_token_wrong_db",
				expiresAtISO: "2026-03-03T00:05:00.000Z",
			}),
		).rejects.toThrow("bardo-staging");
	});

	test("falls back to memory replay protection when Upstash is unreachable in development", async () => {
		const fetchImpl = mock(async () => {
			throw new Error("fetch failed");
		});
		const store = createCliLoginTokenStore({
			nowMs: () => Date.parse("2026-03-03T00:00:00.000Z"),
			env: {
				NODE_ENV: "development",
				BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "true",
				UPSTASH_REDIS_REST_URL: "https://staging.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "upstash-token",
				UPSTASH_REDIS_DATABASE_NAME: "bardo-staging",
			},
			fetchImpl,
		});

		const first = await store.consume({
			token: "cli_token_fallback",
			expiresAtISO: "2026-03-03T00:05:00.000Z",
		});
		const second = await store.consume({
			token: "cli_token_fallback",
			expiresAtISO: "2026-03-03T00:05:00.000Z",
		});

		expect(first).toEqual({ ok: true });
		expect(second).toEqual({ ok: false, reason: "already_used" });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});
});
