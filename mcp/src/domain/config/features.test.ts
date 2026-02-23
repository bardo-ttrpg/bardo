import { describe, expect, test } from "bun:test";
import { resolveFeatureFlags } from "./features";

describe("resolveFeatureFlags", () => {
	test("enables guided setup by default", () => {
		const flags = resolveFeatureFlags({});
		expect(flags.guidedSetupEnabled).toBe(true);
		expect(flags.strictCanonicalMode).toBe(false);
	});

	test("defaults strict canonical mode to true in production", () => {
		const flags = resolveFeatureFlags({
			NODE_ENV: "production",
		});
		expect(flags.strictCanonicalMode).toBe(true);
	});

	test("disables guided setup when explicitly false", () => {
		const flags = resolveFeatureFlags({
			BARDO_GUIDED_SETUP_ENABLED: "false",
		});
		expect(flags.guidedSetupEnabled).toBe(false);
	});

	test("enables strict canonical mode when explicitly true", () => {
		const flags = resolveFeatureFlags({
			BARDO_STRICT_CANONICAL_MODE: "true",
		});
		expect(flags.strictCanonicalMode).toBe(true);
	});
});
