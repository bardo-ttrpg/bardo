import { describe, expect, test } from "bun:test";
import { CliDeviceSessionStoreError } from "../../../../../lib/cli-device-session";
import { createBridgeSessionPollGetHandler } from "./handlers";

describe("GET /api/connect/bridge-session/poll", () => {
	test("returns 429 with rate-limit headers when poll budget is exhausted", async () => {
		const handler = createBridgeSessionPollGetHandler({
			consumeBudget: async () => ({
				allowed: false,
				retryAfterSeconds: 15,
				limit: 60,
				remaining: 0,
				resetEpochSeconds: 1_800_000_015,
			}),
		});

		const response = await handler(
			new Request(
				"https://app.bardo.ai/api/connect/bridge-session/poll?sessionId=bridge_session_123&pollSecret=poll_secret_123",
			),
		);
		const body = await response.json();

		expect(response.status).toBe(429);
		expect(body.error).toContain("Too many bridge session poll requests");
		expect(response.headers.get("retry-after")).toBe("15");
		expect(response.headers.get("x-ratelimit-limit")).toBe("60");
		expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
		expect(response.headers.get("x-ratelimit-reset")).toBe("1800000015");
	});

	test("returns approved credentials when the browser flow is completed", async () => {
		const handler = createBridgeSessionPollGetHandler({
			consumeBudget: async () => ({
				allowed: true,
				retryAfterSeconds: 60,
				limit: 60,
				remaining: 59,
				resetEpochSeconds: 1_800_000_000,
			}),
			pollSession: async ({ sessionId, pollSecret }) => {
				expect(sessionId).toBe("bridge_session_123");
				expect(pollSecret).toBe("poll_secret_123");
				return {
					status: "approved",
					payload: {
						accessToken: "bridge_access",
						refreshToken: "bridge_refresh",
						expiresAt: "2099-03-03T00:10:00.000Z",
						mcpBaseUrl: "https://mcp.bardo.ai",
						statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
						refreshUrl:
							"https://app.bardo.ai/api/connect/bridge-session/refresh",
						accountLabel: "Armando",
						plan: "solo",
						serverName: "bardo",
						issuedAtISO: "2099-03-03T00:00:00.000Z",
					},
				};
			},
		});

		const response = await handler(
			new Request(
				"https://app.bardo.ai/api/connect/bridge-session/poll?sessionId=bridge_session_123&pollSecret=poll_secret_123",
			),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get("x-ratelimit-limit")).toBe("60");
		expect(response.headers.get("x-ratelimit-remaining")).toBe("59");
		expect(response.headers.get("x-ratelimit-reset")).toBe("1800000000");
		expect(body.status).toBe("approved");
		expect(body.accessToken).toBe("bridge_access");
		expect(body.refreshToken).toBe("bridge_refresh");
		expect(body.mcpBaseUrl).toBe("https://mcp.bardo.ai");
	});

	test("returns pending when approval has not happened yet", async () => {
		const handler = createBridgeSessionPollGetHandler({
			pollSession: async () => ({
				status: "pending",
				intervalMs: 3000,
			}),
		});

		const response = await handler(
			new Request(
				"https://app.bardo.ai/api/connect/bridge-session/poll?sessionId=bridge_session_123&pollSecret=poll_secret_123",
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
		const handler = createBridgeSessionPollGetHandler({
			pollSession: async () => {
				throw new Error("poll storage unavailable");
			},
		});

		const response = await handler(
			new Request(
				"https://app.bardo.ai/api/connect/bridge-session/poll?sessionId=bridge_session_123&pollSecret=poll_secret_123",
			),
		);
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.error).toContain("poll storage unavailable");
	});

	test("returns 503 with a stable backend code when polling storage is unavailable", async () => {
		const handler = createBridgeSessionPollGetHandler({
			pollSession: async () => {
				throw new CliDeviceSessionStoreError("poll storage unavailable");
			},
		});

		const response = await handler(
			new Request(
				"https://app.bardo.ai/api/connect/bridge-session/poll?sessionId=bridge_session_123&pollSecret=poll_secret_123",
			),
		);
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.code).toBe("website_backend_unavailable");
		expect(body.retryable).toBe(true);
	});
});
