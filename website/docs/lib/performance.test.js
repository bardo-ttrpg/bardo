import { describe, expect, test } from "bun:test";
import { shouldEnableAmbientEffects } from "./performance";

describe("shouldEnableAmbientEffects", () => {
	test("disables ambient effects when reduced motion is preferred", () => {
		expect(
			shouldEnableAmbientEffects({
				prefersReducedMotion: true,
				saveData: false,
				viewportWidth: 1440,
			}),
		).toBe(false);
	});

	test("disables ambient effects on save-data and narrow viewports", () => {
		expect(
			shouldEnableAmbientEffects({
				prefersReducedMotion: false,
				saveData: true,
				viewportWidth: 1440,
			}),
		).toBe(false);
		expect(
			shouldEnableAmbientEffects({
				prefersReducedMotion: false,
				saveData: false,
				viewportWidth: 640,
			}),
		).toBe(false);
	});

	test("enables ambient effects when motion is allowed, no save-data, and viewport is wide", () => {
		expect(
			shouldEnableAmbientEffects({
				prefersReducedMotion: false,
				saveData: false,
				viewportWidth: 1024,
			}),
		).toBe(true);
	});
});
