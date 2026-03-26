import { describe, expect, test } from "bun:test";
import { validateStagingEnv } from "./validate-staging-env-lib";

describe("validateStagingEnv", () => {
	test("requires the staging mcp env contract", () => {
		const result = validateStagingEnv({});
		expect(result.errors).toContain("NODE_ENV is missing");
		expect(result.errors).toContain("BARDO_AUTH_PROVIDER is missing");
	});

	test("accepts a staging-safe config", () => {
		const result = validateStagingEnv({
			NODE_ENV: "production",
			BARDO_AUTH_PROVIDER: "hosted",
			BARDO_AUTH_MODE: "required",
			BARDO_AUTH_INTROSPECTION_URL:
				"https://staging.bardo.ai/api/auth/introspect-key",
			BARDO_AUTH_INTROSPECTION_TOKEN: "secret",
			BARDO_STRICT_CANONICAL_MODE: "true",
			BARDO_DEFAULT_RULESET: "d20_v1",
			BARDO_GUIDED_SETUP_ENABLED: "true",
			BARDO_SETUP_CONTRACT_V2_REQUIRED: "true",
			BARDO_MCP_TRANSPORT_MODE: "stateless",
			BARDO_MCP_ENABLE_JSON_RESPONSE: "true",
			BARDO_RATE_LIMIT_FAIL_CLOSED: "true",
			BARDO_ALLOW_QUERY_API_KEY: "false",
			BARDO_TELEMETRY_ENABLED: "true",
			BARDO_METRICS_ROUTE_ENABLED: "true",
			BARDO_METRICS_REQUIRE_AUTH: "true",
		});

		expect(result.errors).toEqual([]);
	});

	test("rejects non-staging runtime values", () => {
		const result = validateStagingEnv({
			NODE_ENV: "development",
			BARDO_AUTH_PROVIDER: "env",
			BARDO_AUTH_MODE: "optional",
			BARDO_AUTH_INTROSPECTION_URL:
				"http://localhost:3001/api/auth/introspect-key",
			BARDO_AUTH_INTROSPECTION_TOKEN: "secret",
			BARDO_STRICT_CANONICAL_MODE: "false",
			BARDO_DEFAULT_RULESET: "narrative_v1",
			BARDO_GUIDED_SETUP_ENABLED: "false",
			BARDO_SETUP_CONTRACT_V2_REQUIRED: "false",
			BARDO_MCP_TRANSPORT_MODE: "stateless",
			BARDO_MCP_ENABLE_JSON_RESPONSE: "false",
			BARDO_RATE_LIMIT_FAIL_CLOSED: "false",
			BARDO_ALLOW_QUERY_API_KEY: "true",
		});

		expect(result.errors).toContain("NODE_ENV must be production for staging");
		expect(result.errors).toContain(
			"BARDO_AUTH_PROVIDER must be hosted for staging",
		);
		expect(result.errors).toContain(
			"BARDO_AUTH_INTROSPECTION_URL must use https for staging",
		);
		expect(result.errors).toContain(
			"BARDO_GUIDED_SETUP_ENABLED must be true for staging",
		);
		expect(result.errors).toContain(
			"BARDO_SETUP_CONTRACT_V2_REQUIRED must be true for staging",
		);
		expect(result.errors).toContain(
			"BARDO_MCP_ENABLE_JSON_RESPONSE must be true for staging",
		);
		expect(result.errors).toContain(
			"BARDO_RATE_LIMIT_FAIL_CLOSED must be true for staging",
		);
		expect(result.errors).toContain(
			"BARDO_ALLOW_QUERY_API_KEY must be false for staging",
		);
	});
});
