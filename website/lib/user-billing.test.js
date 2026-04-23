import { expect, test } from "bun:test";
import {
	migrateLegacyPlanTier,
	planCreditsFor,
	resolveBillingState,
} from "./user-billing";

test("planCreditsFor returns expected quotas for supported plans", () => {
	expect(planCreditsFor("free")).toBe(0);
	expect(planCreditsFor("pro")).toBe(25_000);
});

test("migrateLegacyPlanTier maps old plan names", () => {
	expect(migrateLegacyPlanTier(undefined)).toBe("free");
	expect(migrateLegacyPlanTier("free")).toBe("free");
	expect(migrateLegacyPlanTier("solo")).toBe("pro");
	expect(migrateLegacyPlanTier("pro")).toBe("pro");
	expect(migrateLegacyPlanTier("ultra")).toBe("pro");
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
		creditsTotal: 0,
		creditsUsed: 0,
		periodStart: now,
		mcpCallsTotal: 0,
		mcpCallsThisPeriod: 0,
	});
});
