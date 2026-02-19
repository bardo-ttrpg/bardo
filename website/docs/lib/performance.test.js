import { describe, expect, test } from "bun:test";
import { shouldEnableAmbientEffects } from "./performance";

describe("shouldEnableAmbientEffects", () => {
	test("disables ambient effects when reduced motion is preferred", () => {
		expect(
			shouldEnableAmbientEffects({
				prefersReducedMotion: true,
				saveData: false,
				viewportWidth: 1440,
				hardwareConcurrency: 8,
				deviceMemory: 8,
				isHeadlessBrowser: false,
			}),
		).toBe(false);
	});

	test("disables ambient effects on save-data and narrow viewports", () => {
		expect(
			shouldEnableAmbientEffects({
				prefersReducedMotion: false,
				saveData: true,
				viewportWidth: 1440,
				hardwareConcurrency: 8,
				deviceMemory: 8,
				isHeadlessBrowser: false,
			}),
		).toBe(false);
		expect(
			shouldEnableAmbientEffects({
				prefersReducedMotion: false,
				saveData: false,
				viewportWidth: 640,
				hardwareConcurrency: 8,
				deviceMemory: 8,
				isHeadlessBrowser: false,
			}),
		).toBe(false);
	});

	test("disables ambient effects on low-end or headless environments", () => {
		expect(
			shouldEnableAmbientEffects({
				prefersReducedMotion: false,
				saveData: false,
				viewportWidth: 1440,
				hardwareConcurrency: 4,
				deviceMemory: 8,
				isHeadlessBrowser: false,
			}),
		).toBe(false);
		expect(
			shouldEnableAmbientEffects({
				prefersReducedMotion: false,
				saveData: false,
				viewportWidth: 1440,
				hardwareConcurrency: 8,
				deviceMemory: 4,
				isHeadlessBrowser: false,
			}),
		).toBe(false);
		expect(
			shouldEnableAmbientEffects({
				prefersReducedMotion: false,
				saveData: false,
				viewportWidth: 1440,
				hardwareConcurrency: 8,
				deviceMemory: 8,
				isHeadlessBrowser: true,
			}),
		).toBe(false);
	});

	test("enables ambient effects when motion is allowed and device budget is sufficient", () => {
		expect(
			shouldEnableAmbientEffects({
				prefersReducedMotion: false,
				saveData: false,
				viewportWidth: 1024,
				hardwareConcurrency: 8,
				deviceMemory: 8,
				isHeadlessBrowser: false,
			}),
		).toBe(true);
	});
});
