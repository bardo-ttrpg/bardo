import { describe, expect, test } from "bun:test";
import { validateDeployEnv } from "./validate-deploy-env-lib";

describe("validateDeployEnv", () => {
	test("skips production-only checks outside production", () => {
		expect(validateDeployEnv({ NODE_ENV: "development" })).toEqual({
			skipped: true,
			errors: [],
			warnings: [],
		});
	});

	test("requires durable CLI auth/session configuration in production", () => {
		const result = validateDeployEnv({
			VERCEL_ENV: "production",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
		});

		expect(result.skipped).toBe(false);
		expect(result.errors).toContain("BARDO_CLI_LOGIN_SECRET is missing");
		expect(result.errors).toContain(
			"Production CLI device sessions require Upstash REST URL and token.",
		);
		expect(result.errors).toContain(
			"Production CLI device sessions must use the bardo-production Upstash database.",
		);
	});

	test("rejects production memory fallback and staging databases", () => {
		const result = validateDeployEnv({
			VERCEL_ENV: "production",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
			BARDO_CLI_LOGIN_SECRET: "secret",
			BARDO_CLI_DEVICE_SESSION_UPSTASH_REDIS_REST_URL:
				"https://example.upstash.io",
			BARDO_CLI_DEVICE_SESSION_UPSTASH_REDIS_REST_TOKEN: "token",
			BARDO_CLI_DEVICE_SESSION_UPSTASH_DATABASE_NAME: "bardo-staging",
			BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK: "true",
		});

		expect(result.errors).toContain(
			"Production CLI device sessions must use the bardo-production Upstash database.",
		);
		expect(result.errors).toContain(
			"BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK must be false in production.",
		);
	});
});
