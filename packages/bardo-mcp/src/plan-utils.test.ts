import { describe, expect, test } from "bun:test";
import { normalizePlan } from "./plan-utils";

describe("plan utils", () => {
	test("normalizes supported plan aliases", () => {
		expect(normalizePlan("free")).toBe("free");
		expect(normalizePlan(" solo ")).toBe("solo");
		expect(normalizePlan("solo_plus")).toBe("solo");
		expect(normalizePlan("solo-plus")).toBe("solo");
		expect(normalizePlan("soloplus")).toBe("solo");
	});

	test("rejects unknown plan values", () => {
		expect(normalizePlan("team")).toBeNull();
		expect(normalizePlan("")).toBeNull();
		expect(normalizePlan(null)).toBeNull();
		expect(normalizePlan(undefined)).toBeNull();
		expect(normalizePlan(123)).toBeNull();
	});
});
