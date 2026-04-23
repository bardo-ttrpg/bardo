import { describe, expect, test } from "bun:test";
import { createBillingGetHandler } from "./handlers";

describe("GET /api/billing", () => {
	test("returns Clerk-backed billing and credit data", async () => {
		const handler = createBillingGetHandler({
			resolveUserId: async () => ({
				userId: "user_123",
			}),
			readBillingSnapshot: async () => ({
				billingUnavailable: false,
				plan: "pro" as const,
				creditsTotal: 25_000,
				creditsUsed: 12,
				creditsRemaining: 24_988,
				periodStart: 1,
				mcpCallsTotal: 42,
				mcpCallsThisPeriod: 12,
				subscriptionStatus: "active" as const,
				subscriptionId: "sub_123",
				billingInterval: "month" as const,
				currentPeriodEnd: 2,
				cancelAtPeriodEnd: false,
			}),
		});

		const response = await handler();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.billing).toMatchObject({
			plan: "pro",
			creditsTotal: 25000,
			creditsUsed: 12,
			creditsRemaining: 24988,
			mcpCallsTotal: 42,
			mcpCallsThisPeriod: 12,
			currentPeriodEnd: 2,
			billingInterval: "month",
			subscriptionStatus: "active",
		});
		expect(body.billing.apiKeyCallsTotal).toBeUndefined();
		expect(body.billing.apiKeyCallsThisPeriod).toBeUndefined();
		expect(body.accessPolicy).toEqual({
			subscribed: true,
			mcpPeriodLimit: 25_000,
		});
	});

	test("returns 401 for anonymous requests", async () => {
		const handler = createBillingGetHandler({
			resolveUserId: async () => ({
				userId: null,
			}),
			readBillingSnapshot: async () => {
				throw new Error("should not read billing without a user id");
			},
		});

		const response = await handler();
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toBe("Unauthorized");
	});
});
