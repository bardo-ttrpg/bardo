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
					id: "key_created_approve_1",
					secret: "bardo_live_approved",
					name: "CLI Login",
				};
			},
			revokeApiKey: async () => undefined,
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
				id: "key_created_approve_2",
				secret: "bardo_live_approved",
				name: "CLI Login",
			}),
			revokeApiKey: async () => undefined,
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
				id: "key_created_approve_3",
				secret: "bardo_live_approved",
				name: "CLI Login",
			}),
			revokeApiKey: async () => undefined,
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

	test("returns 403 when API key creation is blocked by plan limits", async () => {
		const limitError = Object.assign(
			new Error("API key limit reached for your plan"),
			{ status: 403 },
		);
		const handler = createCliSessionApprovePostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			createApiKey: async () => {
				throw limitError;
			},
			revokeApiKey: async () => undefined,
			approveSession: async () => ({ ok: true }),
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

		expect(response.status).toBe(403);
		expect(body.error).toContain("API key limit reached");
	});

	test("rolls back the generated API key when session approval is rejected", async () => {
		let revokedKeyId: string | null = null;
		const handler = createCliSessionApprovePostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			createApiKey: async () => ({
				id: "key_created_approve_rollback",
				secret: "bardo_live_approved",
				name: "CLI Login",
			}),
			revokeApiKey: async ({ keyId }) => {
				revokedKeyId = keyId;
			},
			approveSession: async () => ({ ok: false, reason: "missing" }),
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

		expect(response.status).toBe(404);
		expect(body.error).toContain("missing");
		expect(revokedKeyId).toBe("key_created_approve_rollback");
	});

	test("rolls back the generated API key when approval storage throws", async () => {
		let revokedKeyId: string | null = null;
		const handler = createCliSessionApprovePostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			createApiKey: async () => ({
				id: "key_created_approve_error",
				secret: "bardo_live_approved",
				name: "CLI Login",
			}),
			revokeApiKey: async ({ keyId }) => {
				revokedKeyId = keyId;
			},
			approveSession: async () => {
				throw new Error("approval backend failed");
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
		expect(body.error).toContain("approval backend failed");
		expect(revokedKeyId).toBe("key_created_approve_error");
	});
});
