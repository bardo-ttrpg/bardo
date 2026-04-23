import { describe, expect, test } from "bun:test";
import { approveBridgeSession } from "./approval-controller";

describe("approveBridgeSession", () => {
	test("posts the session id and returns success state", async () => {
		const fetchImpl = (async (
			input: Parameters<typeof fetch>[0],
			init?: Parameters<typeof fetch>[1],
		) => {
			expect(String(input)).toBe("/api/connect/bridge-session/approve");
			expect(init?.method).toBe("POST");
			expect(init?.body).toBe(
				JSON.stringify({ sessionId: "bridge_session_123" }),
			);
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as unknown as typeof fetch;

		const result = await approveBridgeSession({
			sessionId: "bridge_session_123",
			fetchImpl,
		});

		expect(result).toEqual({
			ok: true,
			message: "Bridge access approved. Return to your AI client.",
		});
	});

	test("surfaces API errors for expired or invalid sessions", async () => {
		const fetchImpl = (async () =>
			new Response(JSON.stringify({ error: "Bridge session expired." }), {
				status: 410,
				headers: { "content-type": "application/json" },
			})) as unknown as typeof fetch;

		const result = await approveBridgeSession({
			sessionId: "expired_session",
			fetchImpl,
		});

		expect(result.ok).toBe(false);
		expect(result.message).toContain("expired");
	});
});
