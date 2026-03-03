import { describe, expect, test } from "bun:test";
import { createCliTokenPostHandler } from "./route";

describe("POST /api/connect/cli-token", () => {
	test("creates a short-lived login token for the authenticated user", async () => {
		const handler = createCliTokenPostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			createApiKey: async ({ userId, name, scopes }) => {
				expect(userId).toBe("user_123");
				expect(name).toContain("CLI Login");
				expect(scopes).toEqual(["mcp"]);
				return {
					secret: "bardo_live_created",
					name,
				};
			},
			createToken: async (payload) => {
				expect(payload.apiKey).toBe("bardo_live_created");
				expect(payload.mcpUrl).toBe("https://mcp.bardo.ai/mcp");
				return "encrypted_cli_token";
			},
			resolveMcpUrl: () => "https://mcp.bardo.ai/mcp",
			exchangeUrl: "https://app.bardo.ai/api/connect/cli-exchange",
			now: () => new Date("2026-03-03T00:00:00.000Z"),
			ttlMs: 300_000,
		});

		const response = await handler(
			new Request("http://localhost:3001/api/connect/cli-token", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.loginToken).toBe("encrypted_cli_token");
		expect(body.exchangeUrl).toBe(
			"https://app.bardo.ai/api/connect/cli-exchange",
		);
		expect(body.mcpUrl).toBe("https://mcp.bardo.ai/mcp");
	});

	test("ignores unapproved scopes and falls back to the mcp scope", async () => {
		const handler = createCliTokenPostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			createApiKey: async ({ scopes }) => {
				expect(scopes).toEqual(["mcp"]);
				return {
					secret: "bardo_live_created",
					name: "CLI Login",
				};
			},
			createToken: async () => "encrypted_cli_token",
			resolveMcpUrl: () => "https://mcp.bardo.ai/mcp",
			exchangeUrl: "https://app.bardo.ai/api/connect/cli-exchange",
			now: () => new Date("2026-03-03T00:00:00.000Z"),
			ttlMs: 300_000,
		});

		const response = await handler(
			new Request("http://localhost:3001/api/connect/cli-token", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					scopes: ["admin", " billing ", "mcp", "", 42],
				}),
			}),
		);

		expect(response.status).toBe(200);
	});

	test("returns a server error when the created API key has no secret", async () => {
		const handler = createCliTokenPostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			createApiKey: async () =>
				({
					secret: undefined,
					name: "CLI Login",
				}) as never,
			createToken: async () => "should_not_be_used",
			resolveMcpUrl: () => "https://mcp.bardo.ai/mcp",
			exchangeUrl: "https://app.bardo.ai/api/connect/cli-exchange",
			now: () => new Date("2026-03-03T00:00:00.000Z"),
			ttlMs: 300_000,
		});

		const response = await handler(
			new Request("http://localhost:3001/api/connect/cli-token", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.error).toContain("API key secret");
	});
});
