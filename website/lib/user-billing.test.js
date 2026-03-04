import { expect, test } from "bun:test";
import {
	migrateLegacyPlanTier,
	planCreditsFor,
	resolveBillingState,
} from "./user-billing";

test("planCreditsFor returns expected quotas for supported plans", () => {
	expect(planCreditsFor("free")).toBe(100);
	expect(planCreditsFor("solo")).toBe(25_000);
	expect(planCreditsFor("solo_plus")).toBe(50_000);
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
	});
});
