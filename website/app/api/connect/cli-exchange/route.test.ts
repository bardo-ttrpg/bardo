import { describe, expect, test } from "bun:test";
import { CliLoginReplayStoreError } from "../../../../lib/cli-login-store";
import { createCliExchangePostHandler } from "./route";

describe("POST /api/connect/cli-exchange", () => {
	test("returns exchange credentials from a valid login token", async () => {
		const consumeToken = async () =>
			({
				ok: true,
			}) as const;
		const handler = createCliExchangePostHandler({
			decodeToken: async (token) => {
				expect(token).toBe("valid_token");
				return {
					apiKey: "bardo_live_token",
					mcpUrl: "https://mcp.bardo.ai/mcp",
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
		expect(body.apiKey).toBe("bardo_live_token");
		expect(body.mcpUrl).toBe("https://mcp.bardo.ai/mcp");
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

	test("returns 500 when the replay store is misconfigured", async () => {
		const handler = createCliExchangePostHandler({
			decodeToken: async () => ({
				apiKey: "bardo_live_token",
				mcpUrl: "https://mcp.bardo.ai/mcp",
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

		expect(response.status).toBe(500);
		expect(body.error).toContain("replay store unavailable");
	});
});
