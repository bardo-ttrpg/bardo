import { expect, test } from "bun:test";
import { displayPriceCents } from "./billing-catalog";

test("displayPriceCents returns monthly and yearly values", () => {
	expect(displayPriceCents("solo", "month")).toBe(1_499);
	expect(displayPriceCents("solo", "year")).toBe(13_499);
	expect(displayPriceCents("solo_plus", "month")).toBe(2_499);
	expect(displayPriceCents("solo_plus", "year")).toBe(22_499);
});
