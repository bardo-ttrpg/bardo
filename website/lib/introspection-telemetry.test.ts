import { describe, expect, mock, test } from "bun:test";
import { createIntrospectionTelemetry } from "./introspection-telemetry";

describe("createIntrospectionTelemetry", () => {
	test("emits a structured telemetry snapshot on the configured cadence", () => {
		const info = mock(() => {});
		const telemetry = createIntrospectionTelemetry({
			logEnabled: true,
			logEvery: 2,
			logger: { info },
		});

		telemetry.increment("clerk_verify_called");
		expect(info).not.toHaveBeenCalled();

		telemetry.increment("success");

		expect(info).toHaveBeenCalledTimes(1);
		expect(info).toHaveBeenCalledWith(
			"bardo.introspection.telemetry_snapshot",
			{
				"bardo.service": "website",
				"bardo.flow": "auth_introspection",
				"bardo.introspection.cache_hit_valid": 0,
				"bardo.introspection.cache_hit_invalid": 0,
				"bardo.introspection.clerk_verify_called": 1,
				"bardo.introspection.clerk_verify_invalid": 0,
				"bardo.introspection.budget_block_user": 0,
				"bardo.introspection.budget_block_key": 0,
				"bardo.introspection.success": 1,
			},
		);
	});
});
