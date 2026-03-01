import { describe, expect, test } from "bun:test";
import { buildIntrospectionSpanAttributes } from "./sentry-introspection";

describe("buildIntrospectionSpanAttributes", () => {
	test("maps stable operational fields for introspection spans", () => {
		const attributes = buildIntrospectionSpanAttributes({
			requiredScope: "mcp",
			workspaceOverrideRequested: true,
			result: "blocked",
			cachedVerification: false,
			preAuthBackend: "upstash",
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
			"bardo.introspection.pre_auth_backend": "upstash",
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

	test("does not emit sensitive identifiers or null-valued dimensions", () => {
		const attributes = buildIntrospectionSpanAttributes({
			requiredScope: "api",
			workspaceOverrideRequested: false,
			result: "invalid",
			cachedVerification: true,
			preAuthBackend: null,
			userBudgetBackend: null,
			keyBudgetBackend: null,
			plan: null,
			telemetrySnapshot: {
				cache_hit_valid: 1,
				cache_hit_invalid: 0,
				clerk_verify_called: 0,
				clerk_verify_invalid: 0,
				budget_block_user: 0,
				budget_block_key: 0,
				success: 0,
			},
		});

		expect(attributes["bardo.introspection.plan"]).toBeUndefined();
		expect(attributes["bardo.introspection.pre_auth_backend"]).toBeUndefined();
		expect(attributes.subjectId).toBeUndefined();
		expect(attributes.keyId).toBeUndefined();
		expect(attributes.workspacePath).toBeUndefined();
		expect(attributes.apiKey).toBeUndefined();
	});
});
