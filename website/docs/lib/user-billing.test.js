import { expect, test } from "bun:test";
import { buildBillingBackfillPatch, resolveBillingState } from "./user-billing";

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
		},
		now,
	);

	expect(patch).toEqual({
		creditsTotal: 1000,
		periodStart: now,
		mcpCallsThisPeriod: 0,
	});
});
