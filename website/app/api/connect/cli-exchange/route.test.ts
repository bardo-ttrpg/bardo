import { describe, expect, test } from "bun:test";
import { CliLoginReplayStoreError } from "../../../../lib/cli-login-store";
import { createCliLoginTokenCodec } from "../../../../lib/cli-login-token";
import { createCliExchangePostHandler } from "./handlers";

describe("POST /api/connect/cli-exchange", () => {
	test("returns 429 with rate-limit headers when exchange budget is exhausted", async () => {
		const handler = createCliExchangePostHandler({
			consumeBudget: async () => ({
				allowed: false,
				retryAfterSeconds: 45,
				limit: 20,
				remaining: 0,
				resetEpochSeconds: 1_800_000_045,
			}),
		});

		const response = await handler(
			new Request("http://localhost:3001/api/connect/cli-exchange", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ token: "valid_token" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(429);
		expect(body.error).toContain("Too many CLI exchange requests");
		expect(response.headers.get("retry-after")).toBe("45");
		expect(response.headers.get("x-ratelimit-limit")).toBe("20");
		expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
		expect(response.headers.get("x-ratelimit-reset")).toBe("1800000045");
	});

	test("returns exchange credentials from a valid login token", async () => {
		const consumeToken = async () =>
			({
				ok: true,
			}) as const;
		const handler = createCliExchangePostHandler({
			consumeBudget: async () => ({
				allowed: true,
				retryAfterSeconds: 60,
				limit: 20,
				remaining: 19,
				resetEpochSeconds: 1_800_000_000,
			}),
			decodeToken: async (token) => {
				expect(token).toBe("valid_token");
				return {
					apiKey: "bardo_live_token",
					mcpUrl: "https://mcp.bardo.ai/mcp",
					statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
					serverName: "bardo",
					issuedAtISO: "2099-03-03T00:00:00.000Z",
					expiresAtISO: "2099-03-03T00:10:00.000Z",
				};
			},
			consumeToken,
		});

		const response = await handler(
			new Request("http://localhost:3001/api/connect/cli-exchange", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ token: "valid_token" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get("x-ratelimit-limit")).toBe("20");
		expect(response.headers.get("x-ratelimit-remaining")).toBe("19");
		expect(response.headers.get("x-ratelimit-reset")).toBe("1800000000");
		expect(body.apiKey).toBe("bardo_live_token");
		expect(body.mcpUrl).toBe("https://mcp.bardo.ai/mcp");
		expect(body.statusUrl).toBe(
			"https://app.bardo.ai/api/connect/runtime-status",
		);
	});

	test("rejects invalid login tokens", async () => {
		const handler = createCliExchangePostHandler({
			decodeToken: async () => {
				throw new Error("invalid token");
			},
		});

		const response = await handler(
			new Request("http://localhost:3001/api/connect/cli-exchange", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ token: "bad_token" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toContain("invalid token");
	});

	test("rejects replayed login tokens after the first successful exchange", async () => {
		const consumeToken = async () =>
			({
				ok: false,
				reason: "already_used",
			}) as const;
		const handler = createCliExchangePostHandler({
			decodeToken: async () => ({
				apiKey: "bardo_live_token",
				mcpUrl: "https://mcp.bardo.ai/mcp",
				statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
				serverName: "bardo",
				issuedAtISO: "2026-03-03T00:00:00.000Z",
				expiresAtISO: "2026-03-03T00:10:00.000Z",
			}),
			consumeToken,
		});

		const response = await handler(
			new Request("http://localhost:3001/api/connect/cli-exchange", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ token: "replayed_token" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.error).toContain("already been used");
	});

	test("returns 503 with a stable backend code when the replay store is unavailable", async () => {
		const handler = createCliExchangePostHandler({
			decodeToken: async () => ({
				apiKey: "bardo_live_token",
				mcpUrl: "https://mcp.bardo.ai/mcp",
				statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
				serverName: "bardo",
				issuedAtISO: "2099-03-03T00:00:00.000Z",
				expiresAtISO: "2099-03-03T00:10:00.000Z",
			}),
			consumeToken: async () => {
				throw new CliLoginReplayStoreError("replay store unavailable");
			},
		});

		const response = await handler(
			new Request("http://localhost:3001/api/connect/cli-exchange", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ token: "valid_token" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.code).toBe("upstash_unavailable");
		expect(body.retryable).toBe(true);
		expect(body.error).toContain("replay store unavailable");
	});

	test("accepts fallback secret from BARDO_AUTH_INTROSPECTION_TOKEN", async () => {
		const previousCliSecret = process.env.BARDO_CLI_LOGIN_SECRET;
		const previousIntrospectionSecret =
			process.env.BARDO_AUTH_INTROSPECTION_TOKEN;

		try {
			delete process.env.BARDO_CLI_LOGIN_SECRET;
			process.env.BARDO_AUTH_INTROSPECTION_TOKEN =
				"fallback-secret-with-length";

			const token = await createCliLoginTokenCodec(
				"fallback-secret-with-length",
			).encrypt({
				apiKey: "bardo_live_token",
				mcpUrl: "https://mcp.bardo.ai/mcp",
				statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
				serverName: "bardo",
				issuedAtISO: "2099-03-03T00:00:00.000Z",
				expiresAtISO: "2099-03-03T00:10:00.000Z",
			});

			const handler = createCliExchangePostHandler({
				consumeToken: async () =>
					({
						ok: true,
					}) as const,
			});

			const response = await handler(
				new Request("http://localhost:3001/api/connect/cli-exchange", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ token }),
				}),
			);

			expect(response.status).toBe(200);
		} finally {
			if (typeof previousCliSecret === "string") {
				process.env.BARDO_CLI_LOGIN_SECRET = previousCliSecret;
			} else {
				delete process.env.BARDO_CLI_LOGIN_SECRET;
			}

			if (typeof previousIntrospectionSecret === "string") {
				process.env.BARDO_AUTH_INTROSPECTION_TOKEN =
					previousIntrospectionSecret;
			} else {
				delete process.env.BARDO_AUTH_INTROSPECTION_TOKEN;
			}
		}
	});

	test("returns a clear configuration error when no CLI login secret is set", async () => {
		const previousCliSecret = process.env.BARDO_CLI_LOGIN_SECRET;
		const previousIntrospectionSecret =
			process.env.BARDO_AUTH_INTROSPECTION_TOKEN;

		try {
			delete process.env.BARDO_CLI_LOGIN_SECRET;
			delete process.env.BARDO_AUTH_INTROSPECTION_TOKEN;

			const handler = createCliExchangePostHandler({
				consumeToken: async () =>
					({
						ok: true,
					}) as const,
			});

			const response = await handler(
				new Request("http://localhost:3001/api/connect/cli-exchange", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ token: "invalid" }),
				}),
			);
			const body = await response.json();

			expect(response.status).toBe(401);
			expect(body.error).toContain("Set BARDO_CLI_LOGIN_SECRET");
		} finally {
			if (typeof previousCliSecret === "string") {
				process.env.BARDO_CLI_LOGIN_SECRET = previousCliSecret;
			} else {
				delete process.env.BARDO_CLI_LOGIN_SECRET;
			}

			if (typeof previousIntrospectionSecret === "string") {
				process.env.BARDO_AUTH_INTROSPECTION_TOKEN =
					previousIntrospectionSecret;
			} else {
				delete process.env.BARDO_AUTH_INTROSPECTION_TOKEN;
			}
		}
	});
});
