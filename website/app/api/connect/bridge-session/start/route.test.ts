import { describe, expect, test } from "bun:test";
import { BridgeSessionStartRateLimitError } from "../../../../../lib/bridge-session-start-rate-limit";
import { createConnectTelemetry } from "../../../../../lib/connect-telemetry";
import { createBridgeSessionStartPostHandler } from "./handlers";

describe("POST /api/connect/bridge-session/start", () => {
	test("returns 429 when the session-start budget is exhausted", async () => {
		const handler = createBridgeSessionStartPostHandler({
			createPendingSession: async () => {
				throw new Error("should not create a session");
			},
			consumeStartBudget: async () => ({
				allowed: false,
				retryAfterSeconds: 60,
				limit: 10,
				remaining: 0,
				resetEpochSeconds: 1_800_000_060,
			}),
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/bridge-session/start", {
				method: "POST",
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(429);
		expect(response.headers.get("retry-after")).toBe("60");
		expect(response.headers.get("x-ratelimit-limit")).toBe("10");
		expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
		expect(response.headers.get("x-ratelimit-reset")).toBe("1800000060");
		expect(body.error).toContain("Too many");
	});

	test("starts a pending bridge session and returns approval metadata", async () => {
		const handler = createBridgeSessionStartPostHandler({
			consumeStartBudget: async () => ({
				allowed: true,
				limit: 10,
				remaining: 9,
				resetEpochSeconds: 1_800_000_000,
			}),
			createPendingSession: async () => ({
				sessionId: "bridge_session_123",
				pollSecret: "poll_secret_123",
				userCode: "ABCD-1234",
				expiresAtISO: "2099-03-03T00:10:00.000Z",
				intervalMs: 3000,
			}),
			resolveVerificationUrl: () =>
				"https://app.bardo.ai/dashboard/connect/bridge/bridge_session_123",
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/bridge-session/start", {
				method: "POST",
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get("x-ratelimit-limit")).toBe("10");
		expect(response.headers.get("x-ratelimit-remaining")).toBe("9");
		expect(response.headers.get("x-ratelimit-reset")).toBe("1800000000");
		expect(body.sessionId).toBe("bridge_session_123");
		expect(body.userCode).toBe("ABCD-1234");
		expect(body.verificationUrl).toBe(
			"https://app.bardo.ai/dashboard/connect/bridge/bridge_session_123",
		);
		expect(body.pollUrl).toBe(
			"https://app.bardo.ai/api/connect/bridge-session/poll?sessionId=bridge_session_123&pollSecret=poll_secret_123",
		);
		expect(body.intervalMs).toBe(3000);
	});

	test("returns a structured 500 when session storage is unavailable", async () => {
		const handler = createBridgeSessionStartPostHandler({
			consumeStartBudget: async () => ({ allowed: true }),
			createPendingSession: async () => {
				throw new Error("website backend unavailable");
			},
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/bridge-session/start", {
				method: "POST",
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.error).toContain("website backend unavailable");
	});

	test("returns 503 with a stable backend code when the start limiter backend is unavailable", async () => {
		const handler = createBridgeSessionStartPostHandler({
			consumeStartBudget: async () => {
				throw new BridgeSessionStartRateLimitError(
					"Bridge session start limiter is unavailable.",
				);
			},
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/bridge-session/start", {
				method: "POST",
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.code).toBe("website_backend_unavailable");
		expect(body.retryable).toBe(true);
	});

	test("records start success and failure outcomes in connect telemetry", async () => {
		const telemetry = createConnectTelemetry();
		const okHandler = createBridgeSessionStartPostHandler({
			telemetry,
			consumeStartBudget: async () => ({ allowed: true }),
			createPendingSession: async () => ({
				sessionId: "bridge_session_123",
				pollSecret: "poll_secret_123",
				userCode: "ABCD-1234",
				expiresAtISO: "2099-03-03T00:10:00.000Z",
				intervalMs: 3000,
			}),
		});
		const failingHandler = createBridgeSessionStartPostHandler({
			telemetry,
			consumeStartBudget: async () => ({ allowed: true }),
			createPendingSession: async () => {
				throw new Error("storage offline");
			},
		});

		await okHandler(
			new Request("https://app.bardo.ai/api/connect/bridge-session/start", {
				method: "POST",
			}),
		);
		await failingHandler(
			new Request("https://app.bardo.ai/api/connect/bridge-session/start", {
				method: "POST",
			}),
		);

		expect(telemetry.snapshot().bridge_session_started).toBe(1);
		expect(telemetry.snapshot().bridge_session_start_failed).toBe(1);
	});
});
