import { expect, test } from "bun:test";
import {
	displayPriceCents,
	normalizePartyCheckoutSeats,
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
