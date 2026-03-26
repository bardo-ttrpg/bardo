import { expect, test } from "bun:test";
import { displayPriceCents } from "./billing-catalog";

test("displayPriceCents returns monthly and yearly values", () => {
	expect(displayPriceCents("solo", "month")).toBe(1_499);
	expect(displayPriceCents("solo", "year")).toBe(13_499);
});
