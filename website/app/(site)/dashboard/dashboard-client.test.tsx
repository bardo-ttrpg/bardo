import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingPlanCard } from "./dashboard-client";

describe("BillingPlanCard", () => {
	test("renders subscription summary from Clerk billing data", () => {
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

		expect(html).toContain("Subscription:");
		expect(html).toContain("Status:");
		expect(html).toContain("MCP Total Calls:");
		expect(html).toContain("42");
		expect(html).toContain("Reset:");
		expect(html).toContain(
			new Date(Date.UTC(2026, 2, 31, 0, 0, 0)).toLocaleString(),
		);
	});
});
