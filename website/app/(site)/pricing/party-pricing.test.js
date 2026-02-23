import { expect, test } from "bun:test";
import {
	normalizePartySeats,
	partyCreditsForSeats,
	partyTotalCentsForSeats,
	sanitizePartySeatsInput,
} from "../../../lib/billing-catalog";

test("sanitizePartySeatsInput strips non-digit characters", () => {
	expect(sanitizePartySeatsInput("12abc 3")).toBe("123");
	expect(sanitizePartySeatsInput("  ")).toBe("");
});

test("normalizePartySeats enforces min/max limits", () => {
	expect(normalizePartySeats(undefined)).toBe(2);
	expect(normalizePartySeats("")).toBe(2);
	expect(normalizePartySeats("1")).toBe(2);
	expect(normalizePartySeats("2")).toBe(2);
	expect(normalizePartySeats("50")).toBe(50);
	expect(normalizePartySeats("999")).toBe(100);
});

test("partyCreditsForSeats scales with normalized seats", () => {
	expect(partyCreditsForSeats(2)).toBe(40_000);
	expect(partyCreditsForSeats(7)).toBe(140_000);
	expect(partyCreditsForSeats(999)).toBe(2_000_000);
});

test("partyTotalCentsForSeats uses monthly and yearly seat rates", () => {
	expect(partyTotalCentsForSeats(2, false)).toBe(2_598);
	expect(partyTotalCentsForSeats(2, true)).toBe(22_800);
	expect(partyTotalCentsForSeats(7, false)).toBe(9_093);
});
