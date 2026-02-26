import { describe, expect, test } from "bun:test";
import { resolveSecurityPolicy } from "./security";

describe("resolveSecurityPolicy", () => {
	test("defaults to optional auth in development", () => {
		const policy = resolveSecurityPolicy({});

		expect(policy.authMode).toBe("optional");
		expect(policy.allowQueryApiKey).toBe(true);
		expect(policy.maxRequestBytes).toBe(1_048_576);
		expect(policy.sessionTtlMs).toBe(3_600_000);
		expect(policy.rateLimitMaxRequests).toBe(120);
		expect(policy.rateLimitWindowMs).toBe(60_000);
		expect(policy.rateLimitFailClosed).toBe(false);
		expect(policy.telemetryEnabled).toBe(true);
		expect(policy.metricsRouteEnabled).toBe(true);
		expect(policy.metricsRequireAuth).toBe(false);
		expect(policy.transportMode).toBe("stateful");
		expect(policy.mcpEnableJsonResponse).toBe(false);
	});

	test("defaults to required auth and disables query API keys in production", () => {
		const policy = resolveSecurityPolicy({ NODE_ENV: "production" });

		expect(policy.authMode).toBe("required");
		expect(policy.allowQueryApiKey).toBe(false);
		expect(policy.rateLimitFailClosed).toBe(true);
		expect(policy.transportMode).toBe("stateful");
	});

	test("supports explicit environment overrides", () => {
		const policy = resolveSecurityPolicy({
			NODE_ENV: "production",
			BARDO_AUTH_MODE: "optional",
			BARDO_ALLOW_QUERY_API_KEY: "true",
			BARDO_MAX_REQUEST_BYTES: "2048",
			BARDO_SESSION_TTL_MS: "5000",
			BARDO_RATE_LIMIT_MAX_REQUESTS: "12",
			BARDO_RATE_LIMIT_WINDOW_MS: "2000",
			BARDO_RATE_LIMIT_FAIL_CLOSED: "true",
			BARDO_TELEMETRY_ENABLED: "false",
			BARDO_METRICS_ROUTE_ENABLED: "false",
			BARDO_METRICS_REQUIRE_AUTH: "false",
			BARDO_MCP_TRANSPORT_MODE: "stateless",
			BARDO_MCP_ENABLE_JSON_RESPONSE: "true",
		});

		expect(policy.authMode).toBe("optional");
		expect(policy.allowQueryApiKey).toBe(true);
		expect(policy.maxRequestBytes).toBe(2048);
		expect(policy.sessionTtlMs).toBe(5000);
		expect(policy.rateLimitMaxRequests).toBe(12);
		expect(policy.rateLimitWindowMs).toBe(2000);
		expect(policy.rateLimitFailClosed).toBe(true);
		expect(policy.telemetryEnabled).toBe(false);
		expect(policy.metricsRouteEnabled).toBe(false);
		expect(policy.metricsRequireAuth).toBe(false);
		expect(policy.transportMode).toBe("stateless");
		expect(policy.mcpEnableJsonResponse).toBe(true);
	});

	test("defaults to stateful transport when mode is not set", () => {
		const policy = resolveSecurityPolicy({
			RAILWAY_ENVIRONMENT_NAME: "production",
		});

		expect(policy.transportMode).toBe("stateful");
		expect(policy.mcpEnableJsonResponse).toBe(false);
	});
});
