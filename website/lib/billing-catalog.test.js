import { expect, test } from "bun:test";
import {
	displayPriceCents,
	getStripePriceId,
	normalizePartyCheckoutSeats,
	resolvePlanFromStripePriceId,
	yearlyPriceCents,
} from "./billing-catalog";

test("yearlyPriceCents returns configured yearly catalog prices", () => {
	expect(yearlyPriceCents("solo")).toBe(13_499);
	expect(yearlyPriceCents("solo_plus")).toBe(22_499);
	expect(yearlyPriceCents("party")).toBe(11_400);
});

test("displayPriceCents returns monthly and yearly values", () => {
	expect(displayPriceCents("solo", "month")).toBe(1_499);
	expect(displayPriceCents("solo", "year")).toBe(13_499);
});

test("normalizePartyCheckoutSeats clamps seat quantities", () => {
	expect(normalizePartyCheckoutSeats(undefined)).toBe(2);
	expect(normalizePartyCheckoutSeats(1)).toBe(2);
	expect(normalizePartyCheckoutSeats(2.9)).toBe(2);
	expect(normalizePartyCheckoutSeats(1000)).toBe(100);
});

test("price-id helpers map plans and intervals", () => {
	const env = {
		STRIPE_PRICE_SOLO_MONTHLY: "price_solo_month",
		STRIPE_PRICE_SOLO_YEARLY: "price_solo_year",
		STRIPE_PRICE_SOLO_PLUS_MONTHLY: "price_solo_plus_month",
		STRIPE_PRICE_SOLO_PLUS_YEARLY: "price_solo_plus_year",
		STRIPE_PRICE_PARTY_MONTHLY: "price_party_month",
		STRIPE_PRICE_PARTY_YEARLY: "price_party_year",
	};

	expect(getStripePriceId("solo", "month", env)).toBe("price_solo_month");
	expect(resolvePlanFromStripePriceId("price_party_year", env)).toEqual({
		plan: "party",
		interval: "year",
	});
	expect(resolvePlanFromStripePriceId("price_unknown", env)).toBeNull();
});
