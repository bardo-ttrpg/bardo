import { describe, expect, test } from "bun:test";
import {
	dailyKeyVerificationLimitForPlan,
	dailyUserVerificationLimitForPlan,
	maxApiKeysForPlan,
} from "./api-keys";

describe("maxApiKeysForPlan", () => {
	test("returns correct limits per plan tier", () => {
		expect(maxApiKeysForPlan("free")).toBe(1);
		expect(maxApiKeysForPlan("solo")).toBe(5);
		expect(maxApiKeysForPlan("solo_plus")).toBe(10);
	});
});

describe("dailyUserVerificationLimitForPlan", () => {
	test("returns balanced daily user-level limits by plan", () => {
		expect(dailyUserVerificationLimitForPlan("free")).toBe(500);
		expect(dailyUserVerificationLimitForPlan("solo")).toBe(7_500);
		expect(dailyUserVerificationLimitForPlan("solo_plus")).toBe(13_000);
	});

	test("supports env overrides", () => {
		const env = {
			BARDO_DAILY_USER_VERIFICATIONS_FREE: "100",
			BARDO_DAILY_USER_VERIFICATIONS_SOLO: "4000",
			BARDO_DAILY_USER_VERIFICATIONS_SOLO_PLUS: "9000",
		};
		expect(dailyUserVerificationLimitForPlan("free", env)).toBe(100);
		expect(dailyUserVerificationLimitForPlan("solo", env)).toBe(4000);
		expect(dailyUserVerificationLimitForPlan("solo_plus", env)).toBe(9000);
	});
});

describe("dailyKeyVerificationLimitForPlan", () => {
	test("returns balanced per-key limits by plan", () => {
		expect(dailyKeyVerificationLimitForPlan("free")).toBe(500);
		expect(dailyKeyVerificationLimitForPlan("solo")).toBe(2_000);
		expect(dailyKeyVerificationLimitForPlan("solo_plus")).toBe(3_000);
	});

	test("supports env overrides", () => {
		const env = {
			BARDO_DAILY_KEY_VERIFICATIONS_FREE: "80",
			BARDO_DAILY_KEY_VERIFICATIONS_SOLO: "1500",
			BARDO_DAILY_KEY_VERIFICATIONS_SOLO_PLUS: "2500",
		};
		expect(dailyKeyVerificationLimitForPlan("free", env)).toBe(80);
		expect(dailyKeyVerificationLimitForPlan("solo", env)).toBe(1500);
		expect(dailyKeyVerificationLimitForPlan("solo_plus", env)).toBe(2500);
	});
});
