import { describe, expect, test } from "bun:test";
import { validateDevelopmentEnv } from "./validate-development-env-lib";

describe("validateDevelopmentEnv", () => {
	test("warns when development env relies on defaults", () => {
		const result = validateDevelopmentEnv({});
		expect(result.errors).toEqual([]);
		expect(result.warnings).toContain(
			"BARDO_MCP_TRANSPORT_MODE is not set; set it to stateless to match the hardened V1 path during development.",
		);
	});

	test("accepts a local hosted-auth development config", () => {
		const result = validateDevelopmentEnv({
			NODE_ENV: "development",
			BARDO_AUTH_PROVIDER: "hosted",
			BARDO_AUTH_INTROSPECTION_URL:
				"http://localhost:3001/api/auth/introspect-key",
			BARDO_AUTH_INTROSPECTION_TOKEN: "secret",
			BARDO_MCP_TRANSPORT_MODE: "stateless",
			BARDO_MCP_ENABLE_JSON_RESPONSE: "true",
		});

		expect(result.errors).toEqual([]);
	});

	test("rejects production mode and broken hosted-auth local config", () => {
		const result = validateDevelopmentEnv({
			NODE_ENV: "production",
			BARDO_AUTH_PROVIDER: "hosted",
			BARDO_AUTH_INTROSPECTION_URL:
				"https://staging.bardo.ai/api/auth/introspect-key",
			BARDO_GUIDED_SETUP_ENABLED: "false",
			BARDO_SETUP_CONTRACT_V2_REQUIRED: "false",
			BARDO_MCP_TRANSPORT_MODE: "stateless",
			BARDO_MCP_ENABLE_JSON_RESPONSE: "false",
		});

		expect(result.errors).toContain(
			"NODE_ENV must not be production for development validation",
		);
		expect(result.errors).toContain(
			"BARDO_AUTH_INTROSPECTION_TOKEN is required when BARDO_AUTH_PROVIDER=hosted during development",
		);
		expect(result.errors).toContain(
			"BARDO_AUTH_INTROSPECTION_URL should point to localhost during development",
		);
		expect(result.errors).toContain(
			"BARDO_MCP_ENABLE_JSON_RESPONSE must be true when BARDO_MCP_TRANSPORT_MODE=stateless",
		);
		expect(result.errors).toContain(
			"BARDO_GUIDED_SETUP_ENABLED must not be false during development; guided setup is part of the current V1 contract",
		);
		expect(result.errors).toContain(
			"BARDO_SETUP_CONTRACT_V2_REQUIRED must not be false during development; setup contract v2 is now the default V1 path",
		);
	});
});
