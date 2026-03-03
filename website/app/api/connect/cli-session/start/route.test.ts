import { describe, expect, test } from "bun:test";
import { createCliSessionStartPostHandler } from "./route";

describe("POST /api/connect/cli-session/start", () => {
	test("starts a pending CLI session and returns approval metadata", async () => {
		const handler = createCliSessionStartPostHandler({
			createPendingSession: async () => ({
				sessionId: "cli_session_123",
				pollSecret: "poll_secret_123",
				userCode: "ABCD-1234",
				expiresAtISO: "2099-03-03T00:10:00.000Z",
				intervalMs: 3000,
			}),
			resolveVerificationUrl: () =>
				"https://app.bardo.ai/dashboard/connect/cli/cli_session_123",
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/cli-session/start", {
				method: "POST",
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.sessionId).toBe("cli_session_123");
		expect(body.userCode).toBe("ABCD-1234");
		expect(body.verificationUrl).toBe(
			"https://app.bardo.ai/dashboard/connect/cli/cli_session_123",
		);
		expect(body.pollUrl).toBe(
			"https://app.bardo.ai/api/connect/cli-session/poll?sessionId=cli_session_123&pollSecret=poll_secret_123",
		);
		expect(body.intervalMs).toBe(3000);
	});

	test("returns a structured 500 when session storage is unavailable", async () => {
		const handler = createCliSessionStartPostHandler({
			createPendingSession: async () => {
				throw new Error("Upstash unavailable");
			},
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/cli-session/start", {
				method: "POST",
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.error).toContain("Upstash unavailable");
	});
});
