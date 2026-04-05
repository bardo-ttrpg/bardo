import { describe, expect, test } from "bun:test";
import { checkReleaseHealth } from "./check-release-health-lib";

describe("checkReleaseHealth", () => {
	test("skips local ad-hoc runs by default", async () => {
		const result = await checkReleaseHealth({
			NODE_ENV: "development",
		});

		expect(result).toEqual({
			skipped: true,
			errors: [],
			warnings: [],
			release: undefined,
		});
	});

	test("requires release metadata when enforced", async () => {
		const result = await checkReleaseHealth({
			BARDO_ENFORCE_RELEASE_HEALTH: "true",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
		});

		expect(result.skipped).toBe(false);
		expect(result.release).toBeUndefined();
		expect(result.errors).toContain("CLERK_SECRET_KEY is missing");
		expect(result.errors).toContain("NEXT_PUBLIC_APP_URL is missing");
		expect(result.errors).toContain("BARDO_APP_BASE_URL is missing");
		expect(result.errors).toContain("BARDO_RUNTIME_STATUS_URL is missing");
		expect(result.errors).toContain("BARDO_BRIDGE_SESSION_REFRESH_URL is missing");
		expect(result.errors).toContain(
			"BARDO_RC_SHA or deployment commit SHA is missing",
		);
	});

	test("uses release fallback sources in enforced release contexts", async () => {
		const result = await checkReleaseHealth({
			CI: "true",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
			NEXT_PUBLIC_APP_URL: "https://www.bardo.gg",
			BARDO_APP_BASE_URL: "https://www.bardo.gg",
			BARDO_RUNTIME_STATUS_URL: "https://www.bardo.gg/api/connect/runtime-status",
			BARDO_BRIDGE_SESSION_REFRESH_URL:
				"https://www.bardo.gg/api/connect/bridge-session/refresh",
			VERCEL_GIT_COMMIT_SHA: "abc123",
		});

		expect(result.skipped).toBe(false);
		expect(result.errors).toEqual([]);
		expect(result.release).toBe("abc123");
	});
});
