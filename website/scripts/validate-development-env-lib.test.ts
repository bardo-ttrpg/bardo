import { describe, expect, test } from "bun:test";
import { validateDevelopmentEnv } from "./validate-development-env-lib";

describe("validateDevelopmentEnv", () => {
	test("warns when development falls back to in-memory website backend behavior", () => {
		const result = validateDevelopmentEnv({});
		expect(result.errors).toEqual([]);
		expect(result.warnings).toContain(
			"BARDO_WEBSITE_BACKEND_SQLITE_PATH is not set; development will rely on memory fallbacks where allowed.",
		);
	});

	test("accepts a fully local development configuration", () => {
		const result = validateDevelopmentEnv({
			NODE_ENV: "development",
			NEXT_PUBLIC_APP_URL: "http://localhost:3001",
			BARDO_WEBSITE_BACKEND_SQLITE_PATH: "/tmp/bardo-dev-backend.json",
			BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK: "false",
		});

		expect(result.errors).toEqual([]);
	});

	test("accepts explicit Blob backend when development fallbacks are disabled", () => {
		const result = validateDevelopmentEnv({
			NODE_ENV: "development",
			NEXT_PUBLIC_APP_URL: "http://localhost:3001",
			BARDO_WEBSITE_BACKEND_DRIVER: "blob",
			BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_token",
			BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK: "false",
		});

		expect(result.errors).toEqual([]);
		expect(result.warnings).not.toContain(
			"BARDO_WEBSITE_BACKEND_SQLITE_PATH is not set; development will rely on memory fallbacks where allowed.",
		);
	});

	test("accepts explicit Convex backend when development fallbacks are disabled", () => {
		const result = validateDevelopmentEnv({
			NODE_ENV: "development",
			NEXT_PUBLIC_APP_URL: "http://localhost:3001",
			BARDO_WEBSITE_BACKEND_DRIVER: "convex",
			BARDO_CONVEX_BACKEND_SECRET: "convex-secret",
			NEXT_PUBLIC_CONVEX_URL: "https://rightful-jackal-218.convex.cloud",
			BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "false",
			BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK: "false",
		});

		expect(result.errors).toEqual([]);
		expect(result.warnings).not.toContain(
			"BARDO_WEBSITE_BACKEND_SQLITE_PATH is not set; development will rely on memory fallbacks where allowed.",
		);
	});

	test("rejects production mode, non-local urls, and disabled fallbacks without a backend", () => {
		const result = validateDevelopmentEnv({
			NODE_ENV: "production",
			NEXT_PUBLIC_APP_URL: "https://staging.bardo.ai",
			BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK: "false",
		});

		expect(result.errors).toContain(
			"NODE_ENV must not be production for development validation",
		);
		expect(result.errors).toContain(
			"NEXT_PUBLIC_APP_URL should point to localhost during development",
		);
		expect(result.errors).toContain(
			"BARDO_WEBSITE_BACKEND_SQLITE_PATH is required when development memory fallbacks are disabled",
		);
	});
});
