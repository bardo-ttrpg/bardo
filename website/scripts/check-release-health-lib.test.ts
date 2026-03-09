import { describe, expect, test } from "bun:test";
import { checkReleaseHealth } from "./check-release-health-lib";

describe("checkReleaseHealth", () => {
	test("skips local ad-hoc runs by default", async () => {
		const result = await checkReleaseHealth(
			{
				NODE_ENV: "development",
			},
			{
				verifySentryAuth: async () => {
					throw new Error("should not run");
				},
			},
		);

		expect(result).toEqual({
			skipped: true,
			errors: [],
			warnings: [],
			release: undefined,
		});
	});

	test("requires release metadata and sentry configuration when enforced", async () => {
		const result = await checkReleaseHealth(
			{
				BARDO_ENFORCE_SENTRY_RELEASE_HEALTH: "true",
				SENTRY_DSN: "https://server@example.ingest.sentry.io/1",
			},
			{
				verifySentryAuth: async () => {
					throw new Error("should not run");
				},
			},
		);

		expect(result.skipped).toBe(false);
		expect(result.release).toBeUndefined();
		expect(result.errors).toContain("NEXT_PUBLIC_SENTRY_DSN is missing");
		expect(result.errors).toContain("SENTRY_ENVIRONMENT is missing");
		expect(result.errors).toContain(
			"NEXT_PUBLIC_SENTRY_ENVIRONMENT is missing",
		);
		expect(result.errors).toContain("SENTRY_RELEASE is missing");
		expect(result.errors).toContain("SENTRY_ORG is missing");
		expect(result.errors).toContain("SENTRY_PROJECT is missing");
		expect(result.errors).toContain("SENTRY_AUTH_TOKEN is missing");
	});

	test("uses release fallback sources and verifies sentry auth in release contexts", async () => {
		const calls: string[] = [];
		const result = await checkReleaseHealth(
			{
				CI: "true",
				SENTRY_DSN: "https://server@example.ingest.sentry.io/1",
				NEXT_PUBLIC_SENTRY_DSN: "https://browser@example.ingest.sentry.io/1",
				SENTRY_ENVIRONMENT: "preview",
				NEXT_PUBLIC_SENTRY_ENVIRONMENT: "preview",
				VERCEL_GIT_COMMIT_SHA: "abc123",
				SENTRY_ORG: "bardo-1k",
				SENTRY_PROJECT: "bardo-website",
				SENTRY_AUTH_TOKEN: "token",
			},
			{
				verifySentryAuth: async (args) => {
					calls.push(`${args.org}/${args.project}/${args.authToken}`);
				},
			},
		);

		expect(result.skipped).toBe(false);
		expect(result.errors).toEqual([]);
		expect(result.release).toBe("abc123");
		expect(calls).toEqual(["bardo-1k/bardo-website/token"]);
	});

	test("surfaces sentry auth verification failures", async () => {
		const result = await checkReleaseHealth(
			{
				VERCEL_ENV: "preview",
				SENTRY_DSN: "https://server@example.ingest.sentry.io/1",
				NEXT_PUBLIC_SENTRY_DSN: "https://browser@example.ingest.sentry.io/1",
				SENTRY_ENVIRONMENT: "staging",
				NEXT_PUBLIC_SENTRY_ENVIRONMENT: "staging",
				SENTRY_RELEASE: "sha-123",
				SENTRY_ORG: "bardo-1k",
				SENTRY_PROJECT: "bardo-website",
				SENTRY_AUTH_TOKEN: "token",
			},
			{
				verifySentryAuth: async () => {
					throw new Error("Invalid token");
				},
			},
		);

		expect(result.errors).toContain(
			"Sentry auth verification failed: Invalid token",
		);
	});
});
