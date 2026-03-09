import { describe, expect, test } from "bun:test";
import { validateStagingEnv } from "./validate-staging-env-lib";

describe("validateStagingEnv", () => {
	test("requires the staging env contract", () => {
		const result = validateStagingEnv({});
		expect(result.errors).toContain(
			"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing",
		);
		expect(result.errors).toContain("BARDO_MCP_BASE_URL is missing");
		expect(result.errors).toContain("BARDO_CLI_LOGIN_SECRET is missing");
		expect(result.errors).toContain("SENTRY_RELEASE is missing");
	});

	test("accepts staging-safe website configuration", () => {
		const result = validateStagingEnv({
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			CLERK_SECRET_KEY: "sk_test_123",
			NEXT_PUBLIC_APP_URL: "https://staging.bardo.ai",
			BARDO_MCP_BASE_URL: "https://mcp-staging-67d7.up.railway.app",
			BARDO_AUTH_INTROSPECTION_TOKEN: "secret",
			BARDO_CLI_LOGIN_SECRET: "cli-secret",
			SENTRY_ENVIRONMENT: "staging",
			NEXT_PUBLIC_SENTRY_DSN: "https://example.ingest.sentry.io/1",
			NEXT_PUBLIC_SENTRY_ENVIRONMENT: "staging",
			SENTRY_RELEASE: "abc123",
			UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
			UPSTASH_REDIS_REST_TOKEN: "token",
			UPSTASH_REDIS_DATABASE_NAME: "bardo-staging",
		});

		expect(result.errors).toEqual([]);
	});

	test("rejects non-staging urls and wrong upstash database", () => {
		const result = validateStagingEnv({
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
			NEXT_PUBLIC_APP_URL: "http://localhost:3001",
			BARDO_MCP_BASE_URL: "http://127.0.0.1:3000",
			BARDO_AUTH_INTROSPECTION_TOKEN: "secret",
			BARDO_CLI_LOGIN_SECRET: "cli-secret",
			SENTRY_ENVIRONMENT: "production",
			SENTRY_RELEASE: "abc123",
			UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
			UPSTASH_REDIS_REST_TOKEN: "token",
			UPSTASH_REDIS_DATABASE_NAME: "bardo-production",
		});

		expect(result.errors).toContain(
			"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must start with pk_test_ for staging",
		);
		expect(result.errors).toContain(
			"CLERK_SECRET_KEY must start with sk_test_ for staging",
		);
		expect(result.errors).toContain(
			"NEXT_PUBLIC_APP_URL must use https for staging",
		);
		expect(result.errors).toContain(
			"BARDO_MCP_BASE_URL must not point to localhost for staging",
		);
		expect(result.errors).toContain(
			"SENTRY_ENVIRONMENT must be staging for staging",
		);
		expect(result.errors).toContain(
			"Staging Upstash configuration must use the bardo-staging database.",
		);
	});
});
