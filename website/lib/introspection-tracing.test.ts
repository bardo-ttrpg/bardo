import { describe, expect, test } from "bun:test";
import { buildIntrospectionSpanAttributes } from "./introspection-tracing";

describe("buildIntrospectionSpanAttributes", () => {
	test("maps stable operational fields for introspection traces", () => {
		const attributes = buildIntrospectionSpanAttributes({
			requiredScope: "mcp",
			workspaceOverrideRequested: true,
			result: "blocked",
			cachedVerification: false,
			preAuthBackend: "memory",
			userBudgetBackend: null,
			keyBudgetBackend: "memory",
			plan: "free",
			telemetrySnapshot: {
				cache_hit_valid: 0,
				cache_hit_invalid: 1,
				clerk_verify_called: 1,
				clerk_verify_invalid: 0,
				budget_block_user: 0,
				budget_block_key: 1,
				success: 0,
			},
		});

		expect(attributes).toEqual({
			"bardo.service": "website",
			"bardo.flow": "auth_introspection",
			"bardo.required_scope": "mcp",
			"bardo.workspace_override_requested": true,
			"bardo.result": "blocked",
			"bardo.introspection.cached_verification": false,
			"bardo.introspection.pre_auth_backend": "memory",
			"bardo.introspection.key_budget_backend": "memory",
			"bardo.introspection.plan": "free",
			"bardo.introspection.cache_hit_valid": 0,
			"bardo.introspection.cache_hit_invalid": 1,
			"bardo.introspection.clerk_verify_called": 1,
			"bardo.introspection.clerk_verify_invalid": 0,
			"bardo.introspection.budget_block_user": 0,
			"bardo.introspection.budget_block_key": 1,
			"bardo.introspection.success": 0,
		});
	});

	test("preserves website backend labels in introspection traces", () => {
		const attributes = buildIntrospectionSpanAttributes({
			requiredScope: "mcp",
			workspaceOverrideRequested: false,
			result: "invalid",
			cachedVerification: false,
			preAuthBackend: "website",
			userBudgetBackend: null,
			keyBudgetBackend: null,
			plan: null,
			telemetrySnapshot: {
				cache_hit_valid: 0,
				cache_hit_invalid: 0,
				clerk_verify_called: 1,
				clerk_verify_invalid: 1,
				budget_block_user: 0,
				budget_block_key: 0,
				success: 0,
			},
		});

		expect(attributes["bardo.introspection.pre_auth_backend"]).toBe("website");
	});
});
