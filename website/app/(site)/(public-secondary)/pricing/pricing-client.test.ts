import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { shouldShowManageSubscription } from "./pricing-helpers";

const pricingClientSource = readFileSync(
	new URL("./pricing-client.tsx", import.meta.url),
	"utf8",
);

describe("shouldShowManageSubscription", () => {
	test("shows manage subscription when the active plan matches the selected monthly period", () => {
		expect(
			shouldShowManageSubscription({
				billing: {
					plan: "pro",
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
					plan: "pro",
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
					plan: "pro",
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

describe("pricing client CTA stability", () => {
	test("keeps checkout labels static so hydration does not animate button copy", () => {
		expect(pricingClientSource).toContain("checkoutLabel");
		expect(pricingClientSource).not.toContain("PricingCtaLabel");
		expect(pricingClientSource).not.toContain("start-pro-monthly");
		expect(pricingClientSource).toContain("pricingActionSlotClassName");
	});
});
