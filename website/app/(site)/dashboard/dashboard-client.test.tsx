import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

describe("BillingPlanCard", () => {
	test("renders subscription summary from Clerk billing data", async () => {
		mock.module("./_billing/checkout-button", () => ({
			default: () => null,
		}));
		mock.module("./_billing/subscription-details-button", () => ({
			default: () => null,
		}));
		mock.module("./signout-button", () => ({
			DashboardSignOutButton: () => null,
		}));

		const { BillingPlanCard } = await import("./dashboard-client");
		const html = renderToStaticMarkup(
			<BillingPlanCard
				billingLoading={false}
				mcpPeriodLimit={25_000}
				billing={{
					plan: "solo",
					creditsTotal: 25_000,
					creditsUsed: 12,
					creditsRemaining: 24_988,
					periodStart: 1,
					mcpCallsTotal: 42,
					mcpCallsThisPeriod: 12,
					subscriptionStatus: "active",
					subscriptionId: "sub_123",
					billingInterval: "month",
					currentPeriodEnd: Date.UTC(2026, 2, 31, 0, 0, 0),
					cancelAtPeriodEnd: false,
				}}
			/>,
		);

		expect(html).toContain("Access:");
		expect(html).toContain("Status:");
		expect(html).toContain("MCP calls this period:");
		expect(html).toContain("42");
		expect(html).toContain("Credits remaining:");
		expect(html).toContain("Next reset:");
		expect(html).toContain(
			new Date(Date.UTC(2026, 2, 31, 0, 0, 0)).toLocaleString(),
		);
	});
});
