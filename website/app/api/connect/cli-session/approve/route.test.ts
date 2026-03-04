import { describe, expect, test } from "bun:test";
import { CliDeviceSessionStoreError } from "../../../../../lib/cli-device-session";
import { createCliSessionApprovePostHandler } from "./route";

describe("POST /api/connect/cli-session/approve", () => {
	test("approves a pending CLI session for the authenticated user", async () => {
		const handler = createCliSessionApprovePostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			createApiKey: async ({ userId, scopes }) => {
				expect(userId).toBe("user_123");
				expect(scopes).toEqual(["mcp"]);
				return {
					secret: "bardo_live_approved",
					name: "CLI Login",
				};
			},
			approveSession: async ({ sessionId, payload }) => {
				expect(sessionId).toBe("cli_session_123");
				expect(payload.apiKey).toBe("bardo_live_approved");
				expect(payload.statusUrl).toBe(
					"https://app.bardo.ai/api/connect/runtime-status",
				);
				return { ok: true };
			},
			resolveMcpUrl: () => "https://mcp.bardo.ai/mcp",
			resolveStatusUrl: () => "https://app.bardo.ai/api/connect/runtime-status",
			now: () => new Date("2099-03-03T00:00:00.000Z"),
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/cli-session/approve", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId: "cli_session_123" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.ok).toBe(true);
	});

	test("returns a structured 500 when approval storage fails", async () => {
		const handler = createCliSessionApprovePostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			createApiKey: async () => ({
				secret: "bardo_live_approved",
				name: "CLI Login",
			}),
			approveSession: async () => {
				throw new Error("approval storage unavailable");
			},
			resolveMcpUrl: () => "https://mcp.bardo.ai/mcp",
			resolveStatusUrl: () => "https://app.bardo.ai/api/connect/runtime-status",
			now: () => new Date("2099-03-03T00:00:00.000Z"),
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/cli-session/approve", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId: "cli_session_123" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.error).toContain("approval storage unavailable");
	});

	test("returns 503 with a stable backend code when approval storage is unavailable", async () => {
		const handler = createCliSessionApprovePostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			createApiKey: async () => ({
				secret: "bardo_live_approved",
				name: "CLI Login",
			}),
			approveSession: async () => {
				throw new CliDeviceSessionStoreError("approval storage unavailable");
			},
			resolveMcpUrl: () => "https://mcp.bardo.ai/mcp",
			resolveStatusUrl: () => "https://app.bardo.ai/api/connect/runtime-status",
			now: () => new Date("2099-03-03T00:00:00.000Z"),
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/cli-session/approve", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId: "cli_session_123" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.code).toBe("upstash_unavailable");
		expect(body.retryable).toBe(true);
	});
});
