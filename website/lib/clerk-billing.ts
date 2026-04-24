import type { BillingInterval } from "./user-billing";

type CheckoutPlanTier = "pro";

const CLERK_PLAN_ENV: Record<CheckoutPlanTier, string[]> = {
	pro: ["CLERK_BILLING_PLAN_PRO", "CLERK_BILLING_PLAN_SOLO"],
};

export type ClerkPlanPeriod = "month" | "annual";

function clerkPlanEnvVars(plan: CheckoutPlanTier): string[] {
	return CLERK_PLAN_ENV[plan];
}

export function getClerkPlanId(
	plan: CheckoutPlanTier,
	env: Record<string, string | undefined> = process.env,
): string | null {
	for (const envVar of clerkPlanEnvVars(plan)) {
		const value = env[envVar]?.trim();
		if (value && value.length > 0) {
			return value;
		}
	}
	return null;
}

export function isClerkBillingConfigured(
	env: Record<string, string | undefined> = process.env,
): boolean {
	return ["pro"].every((plan) =>
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
	const tiers: CheckoutPlanTier[] = ["pro"];
	const normalizedPlanId = planId.trim();
	return (
		tiers.find((tier) =>
			clerkPlanEnvVars(tier).some(
				(envVar) => env[envVar]?.trim() === normalizedPlanId,
			),
		) ?? null
	);
}
