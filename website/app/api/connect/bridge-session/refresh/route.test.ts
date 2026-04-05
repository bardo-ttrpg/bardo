import { describe, expect, test } from "bun:test";
import { createBridgeSessionRefreshPostHandler } from "./handlers";

describe("POST /api/connect/bridge-session/refresh", () => {
	test("rotates bridge credentials for a still-paid user", async () => {
		const handler = createBridgeSessionRefreshPostHandler({
			decodeRefreshToken: async (token) => {
				expect(token).toBe("refresh_token");
				return {
					sessionId: "bridge_session_123",
					userId: "user_123",
					accountLabel: "Armando",
				};
			},
			readBillingSnapshot: async () => ({
				billingUnavailable: false,
				plan: "solo",
				creditsTotal: 25_000,
				creditsUsed: 0,
				creditsRemaining: 25_000,
				periodStart: 0,
				mcpCallsTotal: 0,
				mcpCallsThisPeriod: 0,
				subscriptionStatus: "active",
				subscriptionId: "sub_123",
				billingInterval: "month",
				currentPeriodEnd: null,
				cancelAtPeriodEnd: false,
			}),
			rotateRefreshSession: async ({
				sessionId,
				refreshToken,
				nextRefreshToken,
			}) => {
				expect(sessionId).toBe("bridge_session_123");
				expect(refreshToken).toBe("refresh_token");
				expect(nextRefreshToken).toBe("refresh_next");
				return { ok: true };
			},
			createBridgeCredentials: async ({ sessionId, userId, plan }) => {
				expect(sessionId).toBe("bridge_session_123");
				expect(userId).toBe("user_123");
				expect(plan).toBe("solo");
				return {
					accessToken: "access_next",
					refreshToken: "refresh_next",
					expiresAt: "2099-03-03T00:10:00.000Z",
					statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
					refreshUrl: "https://app.bardo.ai/api/connect/bridge-session/refresh",
					plan: "solo",
					accountLabel: "Armando",
					serverName: "bardo",
					issuedAtISO: "2099-03-03T00:00:00.000Z",
				};
			},
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/bridge-session/refresh", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ refreshToken: "refresh_token" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.accessToken).toBe("access_next");
		expect(body.refreshToken).toBe("refresh_next");
	});

	test("rejects refresh tokens that are no longer current for the session", async () => {
		const handler = createBridgeSessionRefreshPostHandler({
			decodeRefreshToken: async () => ({
				sessionId: "bridge_session_123",
				userId: "user_123",
				accountLabel: "Armando",
			}),
			readBillingSnapshot: async () => ({
				billingUnavailable: false,
				plan: "solo",
				creditsTotal: 25_000,
				creditsUsed: 0,
				creditsRemaining: 25_000,
				periodStart: 0,
				mcpCallsTotal: 0,
				mcpCallsThisPeriod: 0,
				subscriptionStatus: "active",
				subscriptionId: "sub_123",
				billingInterval: "month",
				currentPeriodEnd: null,
				cancelAtPeriodEnd: false,
			}),
			createBridgeCredentials: async () => ({
				accessToken: "access_next",
				refreshToken: "refresh_next",
				expiresAt: "2099-03-03T00:10:00.000Z",
				statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
				refreshUrl: "https://app.bardo.ai/api/connect/bridge-session/refresh",
				plan: "solo",
				accountLabel: "Armando",
				serverName: "bardo",
				issuedAtISO: "2099-03-03T00:00:00.000Z",
			}),
			rotateRefreshSession: async () => ({ ok: false, reason: "invalid" }),
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/bridge-session/refresh", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ refreshToken: "refresh_token" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toContain("Invalid refresh token");
	});
});
