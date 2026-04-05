import { describe, expect, test } from "bun:test";
import { validateStagingEnv } from "./validate-staging-env-lib";

describe("validateStagingEnv", () => {
	test("requires the staging env contract", () => {
		const result = validateStagingEnv({});
		expect(result.errors).toContain("NODE_ENV is missing");
		expect(result.errors).toContain(
			"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing",
		);
		expect(result.errors).toContain("BARDO_BRIDGE_LOGIN_SECRET is missing");
		expect(result.errors).toContain(
			"BARDO_WEBSITE_BACKEND_SQLITE_PATH is missing",
		);
	});

	test("accepts staging-safe website configuration", () => {
		const result = validateStagingEnv({
			NODE_ENV: "production",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			CLERK_SECRET_KEY: "sk_test_123",
			NEXT_PUBLIC_APP_URL: "https://staging.bardo.ai",
			BARDO_AUTH_INTROSPECTION_TOKEN: "secret",
			BARDO_BRIDGE_LOGIN_SECRET: "bridge-secret",
			BARDO_WEBSITE_BACKEND_SQLITE_PATH: "/srv/bardo/website-backend.json",
			BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK: "false",
		});

		expect(result.errors).toEqual([]);
	});

	test("rejects non-staging urls and hosted fallback drift", () => {
		const result = validateStagingEnv({
			NODE_ENV: "development",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
			NEXT_PUBLIC_APP_URL: "http://localhost:3001",
			BARDO_AUTH_INTROSPECTION_TOKEN: "secret",
			BARDO_BRIDGE_LOGIN_SECRET: "bridge-secret",
			BARDO_WEBSITE_BACKEND_SQLITE_PATH: "/srv/bardo/website-backend.json",
			BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK: "true",
		});

		expect(result.errors).toContain("NODE_ENV must be production for staging");
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
			"BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK must be false for staging",
		);
	});

	test("requires a workspace override allowlist when override is enabled in staging", () => {
		const result = validateStagingEnv({
			NODE_ENV: "production",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			CLERK_SECRET_KEY: "sk_test_123",
			NEXT_PUBLIC_APP_URL: "https://staging.bardo.ai",
			BARDO_AUTH_INTROSPECTION_TOKEN: "secret",
			BARDO_BRIDGE_LOGIN_SECRET: "bridge-secret",
			BARDO_WEBSITE_BACKEND_SQLITE_PATH: "/srv/bardo/website-backend.json",
			BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_ALLOW_WORKSPACE_ROOT_OVERRIDE: "true",
		});

		expect(result.errors).toContain(
			"BARDO_WORKSPACE_ROOT_ALLOWLIST is required when BARDO_ALLOW_WORKSPACE_ROOT_OVERRIDE=true for staging",
		);
	});
});
