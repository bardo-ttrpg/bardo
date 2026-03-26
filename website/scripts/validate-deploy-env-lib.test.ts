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
		expect(result.errors).toContain("BARDO_BRIDGE_LOGIN_SECRET is missing");
		expect(result.errors).toContain(
			"BARDO_WEBSITE_BACKEND_SQLITE_PATH is missing",
		);
	});

	test("rejects production memory fallback flags", () => {
		const result = validateDeployEnv({
			VERCEL_ENV: "production",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
			BARDO_BRIDGE_LOGIN_SECRET: "secret",
			BARDO_WEBSITE_BACKEND_SQLITE_PATH: "/var/lib/bardo/backend.sqlite",
			BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK: "true",
		});

		expect(result.errors).toContain(
			"BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK must be false in production",
		);
	});

	test("requires an allowlist when workspace root override is enabled", () => {
		const result = validateDeployEnv({
			VERCEL_ENV: "production",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
			BARDO_BRIDGE_LOGIN_SECRET: "secret",
			BARDO_WEBSITE_BACKEND_SQLITE_PATH: "/var/lib/bardo/backend.sqlite",
			BARDO_ALLOW_WORKSPACE_ROOT_OVERRIDE: "true",
		});

		expect(result.errors).toContain(
			"BARDO_WORKSPACE_ROOT_ALLOWLIST is required when BARDO_ALLOW_WORKSPACE_ROOT_OVERRIDE=true in production",
		);
	});

	test("accepts hardened production configuration", () => {
		const result = validateDeployEnv({
			VERCEL_ENV: "production",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
			BARDO_BRIDGE_LOGIN_SECRET: "secret",
			BARDO_WEBSITE_BACKEND_SQLITE_PATH: "/var/lib/bardo/backend.sqlite",
			BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_ALLOW_WORKSPACE_ROOT_OVERRIDE: "true",
			BARDO_WORKSPACE_ROOT_ALLOWLIST: "/srv/bardo",
		});

		expect(result.errors).toEqual([]);
	});
});
