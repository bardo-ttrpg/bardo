import type { CheckoutPlanTier } from "./billing-catalog";
import type { BillingInterval } from "./user-billing";

const CLERK_PLAN_ENV: Record<CheckoutPlanTier, string> = {
	solo: "CLERK_BILLING_PLAN_SOLO",
	solo_plus: "CLERK_BILLING_PLAN_SOLO_PLUS",
	party: "CLERK_BILLING_PLAN_PARTY",
};

export type ClerkPlanPeriod = "month" | "annual";

function clerkPlanEnvVar(plan: CheckoutPlanTier): string {
	return CLERK_PLAN_ENV[plan];
}

export function getClerkPlanId(
	plan: CheckoutPlanTier,
	env: Record<string, string | undefined> = process.env,
): string | null {
	const value = env[clerkPlanEnvVar(plan)]?.trim();
	return value && value.length > 0 ? value : null;
}

export function isClerkBillingConfigured(
	env: Record<string, string | undefined> = process.env,
): boolean {
	return ["solo", "solo_plus", "party"].every((plan) =>
		Boolean(getClerkPlanId(plan as CheckoutPlanTier, env)),
	);
}

export function clerkPlanPeriodFromBillingInterval(
	interval: BillingInterval,
): ClerkPlanPeriod {
	return interval === "year" ? "annual" : "month";
}
