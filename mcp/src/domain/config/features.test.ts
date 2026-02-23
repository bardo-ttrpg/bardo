import { describe, expect, test } from "bun:test";
import { resolveFeatureFlags } from "./features";

describe("resolveFeatureFlags", () => {
	test("enables guided setup by default", () => {
		const flags = resolveFeatureFlags({});
		expect(flags.guidedSetupEnabled).toBe(true);
	});

	test("disables guided setup when explicitly false", () => {
		const flags = resolveFeatureFlags({
			BARDO_GUIDED_SETUP_ENABLED: "false",
		});
		expect(flags.guidedSetupEnabled).toBe(false);
	});
});
