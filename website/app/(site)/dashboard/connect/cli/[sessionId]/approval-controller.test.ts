import { describe, expect, test } from "bun:test";
import { approveCliSession } from "./approval-controller";

describe("approveCliSession", () => {
	test("posts the session id and returns success state", async () => {
		const result = await approveCliSession({
			sessionId: "cli_session_123",
			fetchImpl: async (input, init) => {
				expect(String(input)).toBe("/api/connect/cli-session/approve");
				expect(init?.method).toBe("POST");
				expect(init?.body).toBe(
					JSON.stringify({ sessionId: "cli_session_123" }),
				);
				return new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		});

		expect(result).toEqual({
			ok: true,
			message: "CLI access approved. Return to your terminal.",
		});
	});

	test("surfaces API errors for expired or invalid sessions", async () => {
		const result = await approveCliSession({
			sessionId: "expired_session",
			fetchImpl: async () =>
				new Response(JSON.stringify({ error: "CLI session expired." }), {
					status: 410,
					headers: { "content-type": "application/json" },
				}),
		});

		expect(result.ok).toBe(false);
		expect(result.message).toContain("expired");
	});
});
