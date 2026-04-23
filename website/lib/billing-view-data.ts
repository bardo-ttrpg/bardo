import {
	type BillingSnapshot,
	createBillingAdminClient,
} from "./billing-admin";
import { resolveRouteUserId } from "./clerk-route-auth";
import { planCreditsFor } from "./user-billing";

export type BillingViewState = Pick<
	BillingSnapshot,
	| "plan"
	| "creditsTotal"
	| "creditsUsed"
	| "creditsRemaining"
	| "periodStart"
	| "mcpCallsTotal"
	| "mcpCallsThisPeriod"
	| "subscriptionStatus"
	| "subscriptionId"
	| "billingInterval"
	| "currentPeriodEnd"
	| "cancelAtPeriodEnd"
>;

function toBillingViewState(snapshot: BillingSnapshot): BillingViewState {
	return {
		plan: snapshot.plan,
		creditsTotal: snapshot.creditsTotal,
		creditsUsed: snapshot.creditsUsed,
		creditsRemaining: snapshot.creditsRemaining,
		periodStart: snapshot.periodStart,
		mcpCallsTotal: snapshot.mcpCallsTotal,
		mcpCallsThisPeriod: snapshot.mcpCallsThisPeriod,
		subscriptionStatus: snapshot.subscriptionStatus,
		subscriptionId: snapshot.subscriptionId,
		billingInterval: snapshot.billingInterval,
		currentPeriodEnd: snapshot.currentPeriodEnd,
		cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
	};
}

function withCurrentUserProEntitlement(
	billing: BillingViewState,
	hasProPlan: boolean,
): BillingViewState {
	if (!hasProPlan || billing.plan === "pro") {
		return billing;
	}

	const creditsTotal = planCreditsFor("pro");
	return {
		...billing,
		billingInterval: billing.billingInterval ?? "month",
		creditsRemaining: Math.max(0, creditsTotal - billing.creditsUsed),
		creditsTotal,
		plan: "pro",
		subscriptionStatus:
			billing.subscriptionStatus === "canceled"
				? "active"
				: billing.subscriptionStatus,
	};
}

export async function readPricingBillingForCurrentUser(
	route = "/pricing",
): Promise<BillingViewState | null> {
	const routeAuth = await resolveRouteUserId(route);
	const userId = routeAuth.userId;
	if (!userId) {
		return null;
	}

	const billing = toBillingViewState(
		await createBillingAdminClient().readBillingSnapshot(userId),
	);
	return withCurrentUserProEntitlement(
		billing,
		routeAuth.has?.({ plan: "pro" }) ?? false,
	);
}
