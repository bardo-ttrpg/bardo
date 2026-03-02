import { describe, expect, test } from "bun:test";
import {
	buildHostedAuthSpanAttributes,
	buildRequestSpanAttributes,
	buildUsageLimitSpanAttributes,
} from "./sentry-spans";

describe("buildRequestSpanAttributes", () => {
	test("maps stable request-level fields for MCP traces", () => {
		const attributes = buildRequestSpanAttributes({
			route: "/mcp",
			method: "POST",
			status: 429,
			authMode: "required",
			rateLimitOutcome: "allowed",
			usageLimitOutcome: "blocked",
			transportMode: "stateful",
			metricsRouteAuthRequired: false,
		});

		expect(attributes).toEqual({
			"bardo.service": "mcp",
			"bardo.route": "/mcp",
			"http.method": "POST",
			"http.status_code": 429,
			"bardo.auth.mode": "required",
			"bardo.rate_limit.outcome": "allowed",
			"bardo.usage_limit.outcome": "blocked",
			"bardo.transport_mode": "stateful",
			"bardo.metrics_route_auth_required": false,
		});
	});
});

describe("buildHostedAuthSpanAttributes", () => {
	test("maps hosted introspection outcomes without sensitive fields", () => {
		const attributes = buildHostedAuthSpanAttributes({
			provider: "hosted",
			cacheHit: false,
			requiredScope: "mcp",
			workspaceOverrideRequested: true,
			httpOk: true,
			timeout: false,
			result: "valid",
		});

		expect(attributes).toEqual({
			"bardo.auth.provider": "hosted",
			"bardo.auth.cache_hit": false,
			"bardo.auth.required_scope": "mcp",
			"bardo.auth.workspace_override_requested": true,
			"bardo.auth.introspection_http_ok": true,
			"bardo.auth.introspection_timeout": false,
			"bardo.auth.result": "valid",
		});
		expect(attributes.subjectId).toBeUndefined();
		expect(attributes.keyId).toBeUndefined();
		expect(attributes.workspaceRoot).toBeUndefined();
	});
});

describe("buildUsageLimitSpanAttributes", () => {
	test("maps usage-limit decisions with low-cardinality fields", () => {
		const attributes = buildUsageLimitSpanAttributes({
			plan: "solo",
			backend: "upstash",
			limitPresent: true,
			allowed: false,
			period: "2026-02",
			blockCacheHit: true,
			writeTotalsEnabled: false,
			writeLastUsedEnabled: true,
			writeModelMetadataEnabled: false,
		});

		expect(attributes).toEqual({
			"bardo.usage.plan": "solo",
			"bardo.usage.backend": "upstash",
			"bardo.usage.limit_present": true,
			"bardo.usage.allowed": false,
			"bardo.usage.period": "2026-02",
			"bardo.usage.block_cache_hit": true,
			"bardo.usage.write_totals_enabled": false,
			"bardo.usage.write_last_used_enabled": true,
			"bardo.usage.write_model_metadata_enabled": false,
		});
	});
});
