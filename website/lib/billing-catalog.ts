import type { BillingInterval } from "./user-billing";

export type PaidPlanTier = "solo";
export type CheckoutPlanTier = PaidPlanTier;

export const YEARLY_SAVINGS_UP_TO_PERCENT = 25;

const BASE_MONTHLY_CENTS: Record<CheckoutPlanTier, number> = {
	solo: 1_499,
};

const BASE_YEARLY_CENTS: Record<CheckoutPlanTier, number> = {
	solo: 13_499,
};

export function displayPriceCents(
	plan: CheckoutPlanTier,
	interval: BillingInterval,
): number {
	return interval === "year"
		? BASE_YEARLY_CENTS[plan]
		: BASE_MONTHLY_CENTS[plan];
}

export function formatUsdCents(cents: number): string {
	return (cents / 100).toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}
