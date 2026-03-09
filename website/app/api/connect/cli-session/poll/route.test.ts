import { describe, expect, test } from "bun:test";
import { CliDeviceSessionStoreError } from "../../../../../lib/cli-device-session";
import { createCliSessionPollGetHandler } from "./handlers";

describe("GET /api/connect/cli-session/poll", () => {
	test("returns approved credentials when the browser flow is completed", async () => {
		const handler = createCliSessionPollGetHandler({
			pollSession: async ({ sessionId, pollSecret }) => {
				expect(sessionId).toBe("cli_session_123");
				expect(pollSecret).toBe("poll_secret_123");
				return {
					status: "approved",
					payload: {
						apiKey: "bardo_live_test",
						mcpUrl: "https://mcp.bardo.ai/mcp",
						statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
						serverName: "bardo",
						issuedAtISO: "2099-03-03T00:00:00.000Z",
						expiresAtISO: "2099-03-03T00:10:00.000Z",
					},
				};
			},
		});

		const response = await handler(
			new Request(
				"https://app.bardo.ai/api/connect/cli-session/poll?sessionId=cli_session_123&pollSecret=poll_secret_123",
			),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.status).toBe("approved");
		expect(body.apiKey).toBe("bardo_live_test");
	});

	test("returns pending when approval has not happened yet", async () => {
		const handler = createCliSessionPollGetHandler({
			pollSession: async () => ({
				status: "pending",
				intervalMs: 3000,
			}),
		});

		const response = await handler(
			new Request(
				"https://app.bardo.ai/api/connect/cli-session/poll?sessionId=cli_session_123&pollSecret=poll_secret_123",
			),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({
			status: "pending",
			intervalMs: 3000,
		});
	});

	test("returns a structured 500 when session polling storage fails", async () => {
		const handler = createCliSessionPollGetHandler({
			pollSession: async () => {
				throw new Error("poll storage unavailable");
			},
		});

		const response = await handler(
			new Request(
				"https://app.bardo.ai/api/connect/cli-session/poll?sessionId=cli_session_123&pollSecret=poll_secret_123",
			),
		);
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.error).toContain("poll storage unavailable");
	});

	test("returns 503 with a stable backend code when polling storage is unavailable", async () => {
		const handler = createCliSessionPollGetHandler({
			pollSession: async () => {
				throw new CliDeviceSessionStoreError("poll storage unavailable");
			},
		});

		const response = await handler(
			new Request(
				"https://app.bardo.ai/api/connect/cli-session/poll?sessionId=cli_session_123&pollSecret=poll_secret_123",
			),
		);
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.code).toBe("upstash_unavailable");
		expect(body.retryable).toBe(true);
	});
});
