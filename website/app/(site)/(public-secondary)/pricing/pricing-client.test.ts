import { describe, expect, test } from "bun:test";
import { shouldShowManageSubscription } from "./pricing-helpers";

describe("shouldShowManageSubscription", () => {
	test("shows manage subscription when the active plan matches the selected monthly period", () => {
		expect(
			shouldShowManageSubscription({
				billing: {
					plan: "solo",
					subscriptionStatus: "active",
					billingInterval: "month",
				},
				billingPeriod: "month",
			}),
		).toBe(true);
	});

	test("shows manage subscription when the active plan matches the selected yearly period", () => {
		expect(
			shouldShowManageSubscription({
				billing: {
					plan: "solo",
					subscriptionStatus: "active",
					billingInterval: "year",
				},
				billingPeriod: "year",
			}),
		).toBe(true);
	});

	test("keeps checkout visible when the selected period does not match the active subscription", () => {
		expect(
			shouldShowManageSubscription({
				billing: {
					plan: "solo",
					subscriptionStatus: "active",
					billingInterval: "month",
				},
				billingPeriod: "year",
			}),
		).toBe(false);
	});

	test("keeps checkout visible for users without an active paid plan", () => {
		expect(
			shouldShowManageSubscription({
				billing: {
					plan: "free",
					subscriptionStatus: "canceled",
					billingInterval: null,
				},
				billingPeriod: "month",
			}),
		).toBe(false);
	});
});
