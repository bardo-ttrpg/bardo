export type PlanTier = "free" | "solo";
type LegacyPlanTier = "free" | "pro" | "ultra";
type PlanTierInput = PlanTier | LegacyPlanTier | undefined;
export type BillingInterval = "month" | "year";
export type SubscriptionStatus =
	| "incomplete"
	| "incomplete_expired"
	| "trialing"
	| "active"
	| "past_due"
	| "canceled"
	| "unpaid"
	| "paused";

const PLAN_CREDITS: Record<PlanTier, number> = {
	free: 100,
	solo: 25_000,
};

export function migrateLegacyPlanTier(plan: PlanTierInput): PlanTier {
	switch (plan) {
		case "pro":
		case "ultra":
			return "solo";
		case "free":
		case "solo":
			return plan;
		default:
			return "free";
	}
}

export function planCreditsFor(planInput: PlanTierInput): number {
	const plan = migrateLegacyPlanTier(planInput);
	return PLAN_CREDITS[plan];
}

type BillingFields = {
	plan: PlanTierInput;
	creditsTotal: number | undefined;
	creditsUsed: number | undefined;
	periodStart: number | undefined;
	mcpCallsTotal: number | undefined;
	mcpCallsThisPeriod: number | undefined;
};

type ResolvedBillingFields = {
	plan: PlanTier;
	creditsTotal: number;
	creditsUsed: number;
	periodStart: number;
	mcpCallsTotal: number;
	mcpCallsThisPeriod: number;
};

export function resolveBillingState(
	fields: BillingFields,
	now = Date.now(),
): ResolvedBillingFields {
	const plan = migrateLegacyPlanTier(fields.plan);

	return {
		plan,
		creditsTotal: fields.creditsTotal ?? planCreditsFor(plan),
		creditsUsed: fields.creditsUsed ?? 0,
		periodStart: fields.periodStart ?? now,
		mcpCallsTotal: fields.mcpCallsTotal ?? 0,
		mcpCallsThisPeriod: fields.mcpCallsThisPeriod ?? 0,
	};
}
