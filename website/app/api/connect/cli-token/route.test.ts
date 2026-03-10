import { describe, expect, test } from "bun:test";
import { createCliTokenPostHandler, resolveCliLoginSecret } from "./handlers";

describe("POST /api/connect/cli-token", () => {
	test("creates a short-lived login token for the authenticated user", async () => {
		const handler = createCliTokenPostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			createApiKey: async ({ userId, name, scopes }) => {
				expect(userId).toBe("user_123");
				expect(name).toContain("CLI Login");
				expect(scopes).toEqual(["mcp"]);
				return {
					id: "key_created_1",
					secret: "bardo_live_created",
					name,
				};
			},
			revokeApiKey: async () => undefined,
			createToken: async (payload) => {
				expect(payload.apiKey).toBe("bardo_live_created");
				expect(payload.mcpUrl).toBe("https://mcp.bardo.ai/mcp");
				expect(payload.statusUrl).toBe(
					"https://app.bardo.ai/api/connect/runtime-status",
				);
				return "encrypted_cli_token";
			},
			resolveMcpUrl: () => "https://mcp.bardo.ai/mcp",
			exchangeUrl: "https://app.bardo.ai/api/connect/cli-exchange",
			statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
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
		expect(body.statusUrl).toBe(
			"https://app.bardo.ai/api/connect/runtime-status",
		);
	});

	test("ignores unapproved scopes and falls back to the mcp scope", async () => {
		const handler = createCliTokenPostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			createApiKey: async ({ scopes }) => {
				expect(scopes).toEqual(["mcp"]);
				return {
					id: "key_created_2",
					secret: "bardo_live_created",
					name: "CLI Login",
				};
			},
			revokeApiKey: async () => undefined,
			createToken: async () => "encrypted_cli_token",
			resolveMcpUrl: () => "https://mcp.bardo.ai/mcp",
			exchangeUrl: "https://app.bardo.ai/api/connect/cli-exchange",
			statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
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
					id: "key_created_3",
					secret: undefined,
					name: "CLI Login",
				}) as never,
			revokeApiKey: async () => undefined,
			createToken: async () => "should_not_be_used",
			resolveMcpUrl: () => "https://mcp.bardo.ai/mcp",
			exchangeUrl: "https://app.bardo.ai/api/connect/cli-exchange",
			statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
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

	test("returns 403 when API key creation is blocked by plan limits", async () => {
		const limitError = Object.assign(
			new Error("API key limit reached for your plan"),
			{ status: 403 },
		);
		const handler = createCliTokenPostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			createApiKey: async () => {
				throw limitError;
			},
			revokeApiKey: async () => undefined,
			createToken: async () => "should_not_be_used",
			resolveMcpUrl: () => "https://mcp.bardo.ai/mcp",
			exchangeUrl: "https://app.bardo.ai/api/connect/cli-exchange",
			statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
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

		expect(response.status).toBe(403);
		expect(body.error).toBe(
			"CLI login needs a free API key slot on your current plan. Rotate or delete an existing key, then retry.",
		);
	});

	test("rolls back the generated API key when token encryption fails", async () => {
		let revokedKeyId: string | null = null;
		const handler = createCliTokenPostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			createApiKey: async () => ({
				id: "key_created_rollback",
				secret: "bardo_live_created",
				name: "CLI Login",
			}),
			revokeApiKey: async ({ keyId }) => {
				revokedKeyId = keyId;
			},
			createToken: async () => {
				throw new Error("token codec unavailable");
			},
			resolveMcpUrl: () => "https://mcp.bardo.ai/mcp",
			exchangeUrl: "https://app.bardo.ai/api/connect/cli-exchange",
			statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
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
		expect(body.error).toContain("token codec unavailable");
		expect(revokedKeyId).toBe("key_created_rollback");
	});
});

describe("resolveCliLoginSecret", () => {
	test("prefers BARDO_CLI_LOGIN_SECRET when both secrets are present", () => {
		expect(
			resolveCliLoginSecret({
				BARDO_CLI_LOGIN_SECRET: "cli-secret",
				BARDO_AUTH_INTROSPECTION_TOKEN: "introspection-secret",
			}),
		).toBe("cli-secret");
	});

	test("falls back to BARDO_AUTH_INTROSPECTION_TOKEN when CLI secret is missing", () => {
		expect(
			resolveCliLoginSecret({
				BARDO_AUTH_INTROSPECTION_TOKEN: "introspection-secret",
			}),
		).toBe("introspection-secret");
	});

	test("returns null when neither secret is configured", () => {
		expect(resolveCliLoginSecret({})).toBeNull();
	});
});
