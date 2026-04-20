import {
	type BillingSnapshot,
	createBillingAdminClient,
} from "./billing-admin";
import { resolveOptionalUserId } from "./clerk-route-auth";

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

export async function readPricingBillingForCurrentUser(
	route = "/pricing",
): Promise<BillingViewState | null> {
	const userId = await resolveOptionalUserId(route);
	if (!userId) {
		return null;
	}

	const billing = toBillingViewState(
		await createBillingAdminClient().readBillingSnapshot(userId),
	);
	return billing;
}
