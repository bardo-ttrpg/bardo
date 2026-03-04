import { describe, expect, test } from "bun:test";
import { createBillingGetHandler } from "./route";

describe("GET /api/billing", () => {
	test("returns live billing data with creditsUsed derived from real MCP usage", async () => {
		const handler = createBillingGetHandler({
			resolveAuthState: async () => ({ userId: "user_123" }),
			createClerkClient: async () => ({}) as never,
			fetchLiveBilling: async () => ({
				billingUnavailable: false,
				plan: "solo" as const,
				periodStart: 1,
				subscriptionStatus: "active" as const,
				subscriptionId: "sub_123",
				billingInterval: "month" as const,
				currentPeriodEnd: 2,
				cancelAtPeriodEnd: false,
			}),
			readUserUsage: async () => ({
				total: 42,
				thisPeriod: 12,
				backend: "upstash" as const,
			}),
		});

		const response = await handler();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.billing).toMatchObject({
			plan: "solo",
			creditsTotal: 25000,
			creditsUsed: 12,
			mcpCallsTotal: 42,
			mcpCallsThisPeriod: 12,
		});
		expect(body.billing.apiKeyCallsTotal).toBeUndefined();
		expect(body.billing.apiKeyCallsThisPeriod).toBeUndefined();
	});
});
