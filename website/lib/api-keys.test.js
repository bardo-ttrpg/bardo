import { describe, expect, test } from "bun:test";
import { maxApiKeysForPlan } from "./api-keys";

describe("maxApiKeysForPlan", () => {
	test("returns correct limits per plan tier", () => {
		expect(maxApiKeysForPlan("free")).toBe(10);
		expect(maxApiKeysForPlan("solo")).toBe(50);
		expect(maxApiKeysForPlan("solo_plus")).toBe(100);
		expect(maxApiKeysForPlan("party")).toBe(250);
	});
});
