import { expect, test } from "bun:test";
import {
	buildBillingBackfillPatch,
	migrateLegacyPlanTier,
	normalizePartySeats,
	planCreditsFor,
	resolveBillingState,
} from "./user-billing";

test("planCreditsFor returns expected quotas for all plans", () => {
	expect(planCreditsFor("free")).toBe(100);
	expect(planCreditsFor("solo")).toBe(25_000);
	expect(planCreditsFor("solo_plus")).toBe(50_000);
	expect(planCreditsFor("party", 2)).toBe(40_000);
	expect(planCreditsFor("party", 10)).toBe(200_000);
});

test("normalizePartySeats enforces min/max bounds", () => {
	expect(normalizePartySeats(undefined)).toBe(2);
	expect(normalizePartySeats(0)).toBe(2);
	expect(normalizePartySeats(1)).toBe(2);
	expect(normalizePartySeats(2)).toBe(2);
	expect(normalizePartySeats(15.2)).toBe(15);
	expect(normalizePartySeats(100)).toBe(100);
	expect(normalizePartySeats(1000)).toBe(100);
});

test("migrateLegacyPlanTier maps old plan names", () => {
	expect(migrateLegacyPlanTier(undefined)).toBe("free");
	expect(migrateLegacyPlanTier("free")).toBe("free");
	expect(migrateLegacyPlanTier("pro")).toBe("solo");
	expect(migrateLegacyPlanTier("ultra")).toBe("solo_plus");
});

test("resolveBillingState falls back to free-tier defaults for legacy users", () => {
	const now = 1_700_000_000_000;
	const state = resolveBillingState(
		{
			plan: undefined,
			creditsTotal: undefined,
			creditsUsed: undefined,
			periodStart: undefined,
			mcpCallsTotal: undefined,
			mcpCallsThisPeriod: undefined,
			partySeats: undefined,
		},
		now,
	);

	expect(state).toEqual({
		plan: "free",
		creditsTotal: 100,
		creditsUsed: 0,
		periodStart: now,
		mcpCallsTotal: 0,
		mcpCallsThisPeriod: 0,
		partySeats: 2,
	});
});

test("buildBillingBackfillPatch only includes missing fields", () => {
	const now = 1_700_000_000_000;
	const patch = buildBillingBackfillPatch(
		{
			plan: "pro",
			creditsTotal: undefined,
			creditsUsed: 3,
			periodStart: undefined,
			mcpCallsTotal: 7,
			mcpCallsThisPeriod: undefined,
			partySeats: undefined,
		},
		now,
	);

	expect(patch).toEqual({
		plan: "solo",
		creditsTotal: 25_000,
		periodStart: now,
		mcpCallsThisPeriod: 0,
		partySeats: 2,
	});
});

test("resolveBillingState computes party credits using seats", () => {
	const now = 1_700_000_000_000;
	const state = resolveBillingState(
		{
			plan: "party",
			creditsTotal: undefined,
			creditsUsed: undefined,
			periodStart: undefined,
			mcpCallsTotal: undefined,
			mcpCallsThisPeriod: undefined,
			partySeats: 7,
		},
		now,
	);

	expect(state.creditsTotal).toBe(140_000);
	expect(state.partySeats).toBe(7);
});
