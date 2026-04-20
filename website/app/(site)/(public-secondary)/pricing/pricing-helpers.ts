import type { BillingViewState } from "@/lib/billing-view-data";

export type PricingBillingState = Pick<
	BillingViewState,
	"plan" | "subscriptionStatus" | "billingInterval"
>;

export function shouldShowManageSubscription({
	billing,
	billingPeriod,
}: {
	billing: PricingBillingState | null;
	billingPeriod: "month" | "year";
}) {
	return billing?.plan === "solo" && billing.billingInterval === billingPeriod;
}
