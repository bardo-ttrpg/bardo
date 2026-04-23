import { describe, expect, test } from "bun:test";
import {
	dailyKeyVerificationLimitForPlan,
	dailyUserVerificationLimitForPlan,
	maxApiKeysForPlan,
	mcpPeriodLimitForPlan,
} from "./api-keys";

describe("maxApiKeysForPlan", () => {
	test("returns correct limits per plan tier", () => {
		expect(maxApiKeysForPlan("free")).toBe(0);
		expect(maxApiKeysForPlan("pro")).toBe(5);
	});
});

describe("dailyUserVerificationLimitForPlan", () => {
	test("returns default daily user-level limits by plan", () => {
		expect(dailyUserVerificationLimitForPlan("free")).toBe(0);
		expect(dailyUserVerificationLimitForPlan("pro")).toBe(7_500);
	});

	test("supports env overrides for Pro", () => {
		const env = {
			BARDO_DAILY_USER_VERIFICATIONS_PRO: "4000",
		};
		expect(dailyUserVerificationLimitForPlan("free", env)).toBe(0);
		expect(dailyUserVerificationLimitForPlan("pro", env)).toBe(4000);
	});
});

describe("dailyKeyVerificationLimitForPlan", () => {
	test("returns default per-key limits by plan", () => {
		expect(dailyKeyVerificationLimitForPlan("free")).toBe(0);
		expect(dailyKeyVerificationLimitForPlan("pro")).toBe(2_000);
	});

	test("supports env overrides for Pro", () => {
		const env = {
			BARDO_DAILY_KEY_VERIFICATIONS_PRO: "1500",
		};
		expect(dailyKeyVerificationLimitForPlan("free", env)).toBe(0);
		expect(dailyKeyVerificationLimitForPlan("pro", env)).toBe(1500);
	});
});

describe("mcpPeriodLimitForPlan", () => {
	test("returns default billing-period MCP limits by plan", () => {
		expect(mcpPeriodLimitForPlan("free")).toBe(0);
		expect(mcpPeriodLimitForPlan("pro")).toBe(25_000);
	});

	test("supports env overrides for Pro", () => {
		const env = {
			BARDO_MCP_PERIOD_LIMIT_PRO: "20000",
		};
		expect(mcpPeriodLimitForPlan("free", env)).toBe(0);
		expect(mcpPeriodLimitForPlan("pro", env)).toBe(20000);
	});
});
