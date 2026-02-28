import { describe, expect, test } from "bun:test";
import { createIntrospectionTelemetry } from "./introspection-telemetry";

describe("createIntrospectionTelemetry", () => {
	test("tracks counters and returns stable snapshots", () => {
		const telemetry = createIntrospectionTelemetry({
			logEnabled: false,
		});

		telemetry.increment("clerk_verify_called");
		telemetry.increment("clerk_verify_called");
		telemetry.increment("cache_hit_valid");

		expect(telemetry.snapshot()).toEqual({
			cache_hit_valid: 1,
			cache_hit_invalid: 0,
			clerk_verify_called: 2,
			clerk_verify_invalid: 0,
			budget_block_user: 0,
			budget_block_key: 0,
			success: 0,
		});
	});

	test("resets counters", () => {
		const telemetry = createIntrospectionTelemetry({
			logEnabled: false,
		});
		telemetry.increment("success");
		telemetry.reset();
		expect(telemetry.snapshot().success).toBe(0);
	});
});
