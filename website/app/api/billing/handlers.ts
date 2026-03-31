import { NextResponse } from "next/server";
import { mcpPeriodLimitForPlan } from "../../../lib/api-keys";
import { createBillingAdminClient } from "../../../lib/billing-admin";
import { resolveRouteUserId } from "../../../lib/clerk-route-auth";

type BillingRouteDeps = {
	resolveUserId: typeof resolveRouteUserId;
	readBillingSnapshot: (userId: string) => Promise<{
		billingUnavailable: boolean;
		plan: "free" | "solo";
		creditsTotal: number;
		creditsUsed: number;
		creditsRemaining: number;
		periodStart: number;
		mcpCallsTotal: number;
		mcpCallsThisPeriod: number;
		subscriptionStatus:
			| "incomplete"
			| "incomplete_expired"
			| "trialing"
			| "active"
			| "past_due"
			| "canceled"
			| "unpaid"
			| "paused";
		subscriptionId: string | null;
		billingInterval: "month" | "year" | null;
		currentPeriodEnd: number | null;
		cancelAtPeriodEnd: boolean;
	}>;
};

const defaultDeps: BillingRouteDeps = {
	resolveUserId: resolveRouteUserId,
	readBillingSnapshot: async (userId) =>
		await createBillingAdminClient().readBillingSnapshot(userId),
};

export function createBillingGetHandler(
	overrides: Partial<BillingRouteDeps> = {},
) {
	const deps = { ...defaultDeps, ...overrides };

	return async function GET() {
		const authState = await deps.resolveUserId("/api/billing");
		if (authState.response) {
			return authState.response;
		}

		const userId = authState.userId;
		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const billing = await deps.readBillingSnapshot(userId);

		return NextResponse.json({
			billing,
			accessPolicy: {
				subscribed: billing.plan === "solo",
				mcpPeriodLimit: mcpPeriodLimitForPlan(billing.plan),
			},
		});
	};
}

export const GET = createBillingGetHandler();
