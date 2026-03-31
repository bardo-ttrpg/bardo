import type { BillingInterval } from "./user-billing";

type CheckoutPlanTier = "solo";

const CLERK_PLAN_ENV: Record<CheckoutPlanTier, string> = {
	solo: "CLERK_BILLING_PLAN_SOLO",
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
	return ["solo"].every((plan) =>
		Boolean(getClerkPlanId(plan as CheckoutPlanTier, env)),
	);
}

export function clerkPlanPeriodFromBillingInterval(
	interval: BillingInterval,
): ClerkPlanPeriod {
	return interval === "year" ? "annual" : "month";
}

export function resolvePlanFromClerkPlanId(
	planId: string,
	env: Record<string, string | undefined> = process.env,
): CheckoutPlanTier | null {
	const tiers: CheckoutPlanTier[] = ["solo"];
	return tiers.find((tier) => getClerkPlanId(tier, env) === planId) ?? null;
}
