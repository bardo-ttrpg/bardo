import { describe, expect, test } from "bun:test";
import { normalizePlan } from "./plan-utils";

describe("plan utils", () => {
	test("normalizes supported plan aliases", () => {
		expect(normalizePlan("free")).toBe("free");
		expect(normalizePlan(" pro ")).toBe("pro");
		expect(normalizePlan("solo")).toBe("pro");
		expect(normalizePlan("solo_plus")).toBe("pro");
		expect(normalizePlan("solo-plus")).toBe("pro");
		expect(normalizePlan("soloplus")).toBe("pro");
	});

	test("rejects unknown plan values", () => {
		expect(normalizePlan("team")).toBeNull();
		expect(normalizePlan("")).toBeNull();
		expect(normalizePlan(null)).toBeNull();
		expect(normalizePlan(undefined)).toBeNull();
		expect(normalizePlan(123)).toBeNull();
	});
});
