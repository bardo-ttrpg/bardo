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
		expect(result.errors).toContain("NEXT_PUBLIC_APP_URL is missing");
		expect(result.errors).toContain("BARDO_APP_BASE_URL is missing");
		expect(result.errors).toContain("BARDO_RUNTIME_STATUS_URL is missing");
		expect(result.errors).toContain(
			"BARDO_BRIDGE_SESSION_REFRESH_URL is missing",
		);
		expect(result.errors).toContain("BARDO_BRIDGE_LOGIN_SECRET is missing");
		expect(result.errors).toContain(
			"CONVEX_URL, NEXT_PUBLIC_CONVEX_URL, BLOB_READ_WRITE_TOKEN, or BARDO_WEBSITE_BACKEND_SQLITE_PATH is missing",
		);
	});

	test("rejects production memory fallback flags", () => {
		const result = validateDeployEnv({
			VERCEL_ENV: "production",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
			NEXT_PUBLIC_APP_URL: "https://www.bardo.gg",
			BARDO_APP_BASE_URL: "https://www.bardo.gg",
			BARDO_RUNTIME_STATUS_URL:
				"https://www.bardo.gg/api/connect/runtime-status",
			BARDO_BRIDGE_SESSION_REFRESH_URL:
				"https://www.bardo.gg/api/connect/bridge-session/refresh",
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
			NEXT_PUBLIC_APP_URL: "https://www.bardo.gg",
			BARDO_APP_BASE_URL: "https://www.bardo.gg",
			BARDO_RUNTIME_STATUS_URL:
				"https://www.bardo.gg/api/connect/runtime-status",
			BARDO_BRIDGE_SESSION_REFRESH_URL:
				"https://www.bardo.gg/api/connect/bridge-session/refresh",
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
			NEXT_PUBLIC_APP_URL: "https://www.bardo.gg",
			BARDO_APP_BASE_URL: "https://www.bardo.gg",
			BARDO_RUNTIME_STATUS_URL:
				"https://www.bardo.gg/api/connect/runtime-status",
			BARDO_BRIDGE_SESSION_REFRESH_URL:
				"https://www.bardo.gg/api/connect/bridge-session/refresh",
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

	test("rejects localhost service URLs in production", () => {
		const result = validateDeployEnv({
			VERCEL_ENV: "production",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
			NEXT_PUBLIC_APP_URL: "https://www.bardo.gg",
			BARDO_APP_BASE_URL: "https://www.bardo.gg",
			BARDO_RUNTIME_STATUS_URL:
				"http://127.0.0.1:3001/api/connect/runtime-status",
			BARDO_BRIDGE_SESSION_REFRESH_URL:
				"https://www.bardo.gg/api/connect/bridge-session/refresh",
			BARDO_BRIDGE_LOGIN_SECRET: "secret",
			BARDO_WEBSITE_BACKEND_SQLITE_PATH: "/tmp/bardo/website-backend.json",
		});

		expect(result.errors).toContain(
			"BARDO_RUNTIME_STATUS_URL must not point to localhost for production",
		);
	});

	test("rejects /tmp file backend paths in production", () => {
		const result = validateDeployEnv({
			VERCEL_ENV: "production",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
			NEXT_PUBLIC_APP_URL: "https://www.bardo.gg",
			BARDO_APP_BASE_URL: "https://www.bardo.gg",
			BARDO_RUNTIME_STATUS_URL:
				"https://www.bardo.gg/api/connect/runtime-status",
			BARDO_BRIDGE_SESSION_REFRESH_URL:
				"https://www.bardo.gg/api/connect/bridge-session/refresh",
			BARDO_BRIDGE_LOGIN_SECRET: "secret",
			BARDO_WEBSITE_BACKEND_DRIVER: "file",
			BARDO_WEBSITE_BACKEND_SQLITE_PATH: "/tmp/bardo/website-backend.json",
		});

		expect(result.errors).toContain(
			"BARDO_WEBSITE_BACKEND_SQLITE_PATH must not use /tmp in production",
		);
	});

	test("accepts Vercel Blob as the production backend", () => {
		const result = validateDeployEnv({
			VERCEL_ENV: "production",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
			NEXT_PUBLIC_APP_URL: "https://www.bardo.gg",
			BARDO_APP_BASE_URL: "https://www.bardo.gg",
			BARDO_RUNTIME_STATUS_URL:
				"https://www.bardo.gg/api/connect/runtime-status",
			BARDO_BRIDGE_SESSION_REFRESH_URL:
				"https://www.bardo.gg/api/connect/bridge-session/refresh",
			BARDO_BRIDGE_LOGIN_SECRET: "secret",
			BARDO_WEBSITE_BACKEND_DRIVER: "blob",
			BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_token",
			BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK: "false",
		});

		expect(result.errors).toEqual([]);
	});

	test("accepts Convex as the production backend", () => {
		const result = validateDeployEnv({
			VERCEL_ENV: "production",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
			NEXT_PUBLIC_APP_URL: "https://www.bardo.gg",
			BARDO_APP_BASE_URL: "https://www.bardo.gg",
			BARDO_RUNTIME_STATUS_URL:
				"https://www.bardo.gg/api/connect/runtime-status",
			BARDO_BRIDGE_SESSION_REFRESH_URL:
				"https://www.bardo.gg/api/connect/bridge-session/refresh",
			BARDO_BRIDGE_LOGIN_SECRET: "secret",
			BARDO_WEBSITE_BACKEND_DRIVER: "convex",
			BARDO_CONVEX_BACKEND_SECRET: "convex-secret",
			NEXT_PUBLIC_CONVEX_URL: "https://rightful-jackal-218.convex.cloud",
			BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK: "false",
		});

		expect(result.errors).toEqual([]);
	});

	test("rejects invalid Convex production URLs", () => {
		const result = validateDeployEnv({
			VERCEL_ENV: "production",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
			NEXT_PUBLIC_APP_URL: "https://www.bardo.gg",
			BARDO_APP_BASE_URL: "https://www.bardo.gg",
			BARDO_RUNTIME_STATUS_URL:
				"https://www.bardo.gg/api/connect/runtime-status",
			BARDO_BRIDGE_SESSION_REFRESH_URL:
				"https://www.bardo.gg/api/connect/bridge-session/refresh",
			BARDO_BRIDGE_LOGIN_SECRET: "secret",
			BARDO_WEBSITE_BACKEND_DRIVER: "convex",
			NEXT_PUBLIC_CONVEX_URL: "http://localhost:3210",
		});

		expect(result.errors).toContain(
			"CONVEX_URL or NEXT_PUBLIC_CONVEX_URL must use https for production",
		);
		expect(result.errors).toContain(
			"CONVEX_URL or NEXT_PUBLIC_CONVEX_URL must not point to localhost for production",
		);
		expect(result.errors).toContain("BARDO_CONVEX_BACKEND_SECRET is missing");
	});

	test("allows explicit temporary memory fallback when durable storage is unavailable", () => {
		const result = validateDeployEnv({
			VERCEL_ENV: "production",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
			NEXT_PUBLIC_APP_URL: "https://www.bardo.gg",
			BARDO_APP_BASE_URL: "https://www.bardo.gg",
			BARDO_RUNTIME_STATUS_URL:
				"https://www.bardo.gg/api/connect/runtime-status",
			BARDO_BRIDGE_SESSION_REFRESH_URL:
				"https://www.bardo.gg/api/connect/bridge-session/refresh",
			BARDO_BRIDGE_LOGIN_SECRET: "secret",
			BARDO_WEBSITE_BACKEND_ALLOW_MEMORY_FALLBACK: "true",
			BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK: "true",
			BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "true",
			BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK: "true",
		});

		expect(result.errors).toEqual([]);
		expect(result.warnings).toContain(
			"BARDO_WEBSITE_BACKEND_ALLOW_MEMORY_FALLBACK=true is temporary and not durable for production bridge sessions",
		);
	});
});
