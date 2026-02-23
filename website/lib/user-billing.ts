export type PlanTier = "free" | "solo" | "solo_plus" | "party";
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

const PLAN_CREDITS: Record<Exclude<PlanTier, "party">, number> = {
	free: 100,
	solo: 25_000,
	solo_plus: 50_000,
};

const PARTY_CREDITS_PER_SEAT = 20_000;
export const PARTY_MIN_SEATS = 2;
export const PARTY_MAX_SEATS = 100;

export function migrateLegacyPlanTier(plan: PlanTierInput): PlanTier {
	switch (plan) {
		case "pro":
			return "solo";
		case "ultra":
			return "solo_plus";
		case "free":
		case "solo":
		case "solo_plus":
		case "party":
			return plan;
		default:
			return "free";
	}
}

export function normalizePartySeats(rawSeats: number | undefined): number {
	if (!Number.isFinite(rawSeats)) {
		return PARTY_MIN_SEATS;
	}

	const rounded = Math.floor(rawSeats ?? PARTY_MIN_SEATS);
	return Math.max(PARTY_MIN_SEATS, Math.min(PARTY_MAX_SEATS, rounded));
}

export function planCreditsFor(
	planInput: PlanTierInput,
	partySeats?: number,
): number {
	const plan = migrateLegacyPlanTier(planInput);
	if (plan === "party") {
		return PARTY_CREDITS_PER_SEAT * normalizePartySeats(partySeats);
	}

	return PLAN_CREDITS[plan];
}

type BillingFields = {
	plan: PlanTierInput;
	creditsTotal: number | undefined;
	creditsUsed: number | undefined;
	periodStart: number | undefined;
	mcpCallsTotal: number | undefined;
	mcpCallsThisPeriod: number | undefined;
	partySeats: number | undefined;
};

type ResolvedBillingFields = {
	plan: PlanTier;
	creditsTotal: number;
	creditsUsed: number;
	periodStart: number;
	mcpCallsTotal: number;
	mcpCallsThisPeriod: number;
	partySeats: number;
};

export function resolveBillingState(
	fields: BillingFields,
	now = Date.now(),
): ResolvedBillingFields {
	const plan = migrateLegacyPlanTier(fields.plan);
	const partySeats = normalizePartySeats(fields.partySeats);

	return {
		plan,
		creditsTotal: fields.creditsTotal ?? planCreditsFor(plan, partySeats),
		creditsUsed: fields.creditsUsed ?? 0,
		periodStart: fields.periodStart ?? now,
		mcpCallsTotal: fields.mcpCallsTotal ?? 0,
		mcpCallsThisPeriod: fields.mcpCallsThisPeriod ?? 0,
		partySeats,
	};
}

export function buildBillingBackfillPatch(
	fields: BillingFields,
	now = Date.now(),
): Partial<ResolvedBillingFields> {
	const resolved = resolveBillingState(fields, now);
	const patch: Partial<ResolvedBillingFields> = {};

	if (fields.plan !== resolved.plan) {
		patch.plan = resolved.plan;
	}
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
	if (fields.partySeats === undefined) patch.partySeats = resolved.partySeats;

	return patch;
}
