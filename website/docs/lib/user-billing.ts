export type PlanTier = "free" | "pro" | "ultra";

const PLAN_CREDITS: Record<PlanTier, number> = {
	free: 100,
	pro: 1000,
	ultra: 10000,
};

export function planCreditsFor(plan: PlanTier): number {
	return PLAN_CREDITS[plan];
}

type BillingFields = {
	plan: PlanTier | undefined;
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
	const plan = fields.plan ?? "free";

	return {
		plan,
		creditsTotal: fields.creditsTotal ?? planCreditsFor(plan),
		creditsUsed: fields.creditsUsed ?? 0,
		periodStart: fields.periodStart ?? now,
		mcpCallsTotal: fields.mcpCallsTotal ?? 0,
		mcpCallsThisPeriod: fields.mcpCallsThisPeriod ?? 0,
	};
}

export function buildBillingBackfillPatch(
	fields: BillingFields,
	now = Date.now(),
): Partial<ResolvedBillingFields> {
	const resolved = resolveBillingState(fields, now);
	const patch: Partial<ResolvedBillingFields> = {};

	if (fields.plan === undefined) patch.plan = resolved.plan;
	if (fields.creditsTotal === undefined)
		patch.creditsTotal = resolved.creditsTotal;
	if (fields.creditsUsed === undefined)
		patch.creditsUsed = resolved.creditsUsed;
	if (fields.periodStart === undefined)
		patch.periodStart = resolved.periodStart;
	if (fields.mcpCallsTotal === undefined)
		patch.mcpCallsTotal = resolved.mcpCallsTotal;
	if (fields.mcpCallsThisPeriod === undefined)
		patch.mcpCallsThisPeriod = resolved.mcpCallsThisPeriod;

	return patch;
}
