import { describe, expect, test } from "bun:test";
import { CliDeviceSessionStoreError } from "../../../../../lib/cli-device-session";
import { createBridgeSessionApprovePostHandler } from "./handlers";

describe("POST /api/connect/bridge-session/approve", () => {
	test("approves a pending bridge session for a subscribed user", async () => {
		const handler = createBridgeSessionApprovePostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			readBillingSnapshot: async () => ({
				billingUnavailable: false,
				plan: "pro",
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
			createBridgeCredentials: async ({ sessionId, userId, plan }) => {
				expect(sessionId).toBe("bridge_session_123");
				expect(userId).toBe("user_123");
				expect(plan).toBe("pro");
				return {
					accessToken: "bridge_access",
					refreshToken: "bridge_refresh",
					expiresAt: "2099-03-03T00:10:00.000Z",
					statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
					refreshUrl: "https://app.bardo.ai/api/connect/bridge-session/refresh",
					plan: "pro",
					accountLabel: "Armando",
					serverName: "bardo",
					issuedAtISO: "2099-03-03T00:00:00.000Z",
				};
			},
			approveSession: async ({ sessionId, payload }) => {
				expect(sessionId).toBe("bridge_session_123");
				expect(payload.accessToken).toBe("bridge_access");
				expect(payload.refreshUrl).toContain("/bridge-session/refresh");
				return { ok: true };
			},
			resolveStatusUrl: () => "https://app.bardo.ai/api/connect/runtime-status",
			resolveRefreshUrl: () =>
				"https://app.bardo.ai/api/connect/bridge-session/refresh",
			now: () => new Date("2099-03-03T00:00:00.000Z"),
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/bridge-session/approve", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId: "bridge_session_123" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.ok).toBe(true);
	});

	test("approves when Clerk plan entitlement is active but the billing snapshot lags", async () => {
		const handler = createBridgeSessionApprovePostHandler({
			resolveUserId: async () => ({
				userId: "user_123",
				has: ({ plan }) => plan === "pro",
			}),
			readBillingSnapshot: async () => ({
				billingUnavailable: false,
				plan: "free",
				creditsTotal: 100,
				creditsUsed: 0,
				creditsRemaining: 100,
				periodStart: 0,
				mcpCallsTotal: 0,
				mcpCallsThisPeriod: 0,
				subscriptionStatus: "active",
				subscriptionId: null,
				billingInterval: null,
				currentPeriodEnd: null,
				cancelAtPeriodEnd: false,
			}),
			createBridgeCredentials: async ({ plan }) => {
				expect(plan).toBe("pro");
				return {
					accessToken: "bridge_access",
					refreshToken: "bridge_refresh",
					expiresAt: "2099-03-03T00:10:00.000Z",
					statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
					refreshUrl: "https://app.bardo.ai/api/connect/bridge-session/refresh",
					plan: "pro",
					accountLabel: "Armando",
					serverName: "bardo",
					issuedAtISO: "2099-03-03T00:00:00.000Z",
				};
			},
			approveSession: async () => ({ ok: true }),
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/bridge-session/approve", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId: "bridge_session_123" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.ok).toBe(true);
	});

	test("rejects approval and denies the pending session when the user does not have an active subscription", async () => {
		let deniedSessionId: string | null = null;
		const handler = createBridgeSessionApprovePostHandler({
			resolveUserId: async () => ({
				userId: "user_123",
				has: () => false,
			}),
			readBillingSnapshot: async () => ({
				billingUnavailable: false,
				plan: "free",
				creditsTotal: 100,
				creditsUsed: 0,
				creditsRemaining: 100,
				periodStart: 0,
				mcpCallsTotal: 0,
				mcpCallsThisPeriod: 0,
				subscriptionStatus: "canceled",
				subscriptionId: null,
				billingInterval: null,
				currentPeriodEnd: null,
				cancelAtPeriodEnd: false,
			}),
			createBridgeCredentials: async () => {
				throw new Error("should not mint bridge credentials");
			},
			approveSession: async () => {
				throw new Error("should not approve");
			},
			denySession: async ({ sessionId, reason }) => {
				deniedSessionId = sessionId;
				expect(reason).toContain("active Pro subscription");
				return { ok: true };
			},
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/bridge-session/approve", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId: "bridge_session_123" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(403);
		expect(body.error).toContain("active Pro subscription");
		expect(deniedSessionId).toBe("bridge_session_123");
	});

	test("returns a structured 500 when bridge credential issuance fails", async () => {
		const handler = createBridgeSessionApprovePostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			readBillingSnapshot: async () => ({
				billingUnavailable: false,
				plan: "pro",
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
			createBridgeCredentials: async () => {
				throw new Error("bridge credential issuance unavailable");
			},
			approveSession: async () => ({ ok: true }),
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/bridge-session/approve", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId: "bridge_session_123" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.error).toContain("bridge credential issuance unavailable");
	});

	test("returns 503 with a stable backend code when approval storage is unavailable", async () => {
		const handler = createBridgeSessionApprovePostHandler({
			resolveUserId: async () => ({ userId: "user_123" }),
			readBillingSnapshot: async () => ({
				billingUnavailable: false,
				plan: "pro",
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
				accessToken: "bridge_access",
				refreshToken: "bridge_refresh",
				expiresAt: "2099-03-03T00:10:00.000Z",
				statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
				refreshUrl: "https://app.bardo.ai/api/connect/bridge-session/refresh",
				plan: "pro",
				accountLabel: "Armando",
				serverName: "bardo",
				issuedAtISO: "2099-03-03T00:00:00.000Z",
			}),
			approveSession: async () => {
				throw new CliDeviceSessionStoreError("approval storage unavailable");
			},
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/bridge-session/approve", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId: "bridge_session_123" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.code).toBe("website_backend_unavailable");
		expect(body.retryable).toBe(true);
	});
});
