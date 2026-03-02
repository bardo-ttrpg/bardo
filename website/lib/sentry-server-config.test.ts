import { describe, expect, test } from "bun:test";
import {
	createServerSentryOptions,
	resolveSentryOrgSlug,
	resolveSentryRelease,
} from "./sentry-server-config";

describe("createServerSentryOptions", () => {
	test("uses server env defaults without enabling pii", () => {
		const options = createServerSentryOptions({
			SENTRY_DSN: "https://server@example.ingest.sentry.io/1",
			SENTRY_ENVIRONMENT: "staging",
			SENTRY_RELEASE: "website@abc123",
			SENTRY_TRACES_SAMPLE_RATE: "0.25",
		});

		expect(options).toEqual({
			dsn: "https://server@example.ingest.sentry.io/1",
			enabled: true,
			environment: "staging",
			release: "website@abc123",
			tracesSampleRate: 0.25,
			enableLogs: true,
			sendDefaultPii: false,
		});
	});
});

describe("resolveSentryRelease", () => {
	test("falls back to platform git sha values when SENTRY_RELEASE is absent", () => {
		expect(
			resolveSentryRelease({
				VERCEL_GIT_COMMIT_SHA: "vercel-sha",
			}),
		).toBe("vercel-sha");
		expect(
			resolveSentryRelease({
				RAILWAY_GIT_COMMIT_SHA: "railway-sha",
			}),
		).toBe("railway-sha");
	});

	test("returns the explicit release when provided", () => {
		expect(
			resolveSentryRelease({
				SENTRY_RELEASE: "website@explicit-release",
				VERCEL_GIT_COMMIT_SHA: "ignored-sha",
			}),
		).toBe("website@explicit-release");
	});
});

describe("resolveSentryOrgSlug", () => {
	test("resolves an accessible organization slug from the configured org name", () => {
		expect(
			resolveSentryOrgSlug(
				{
					SENTRY_ORG: "bardo",
					SENTRY_AUTH_TOKEN: "token",
				},
				() => [
					{
						slug: "bardo-1k",
						name: "bardo",
					},
				],
			),
		).toBe("bardo-1k");
	});

	test("keeps the configured org when no accessible organization matches", () => {
		expect(
			resolveSentryOrgSlug(
				{
					SENTRY_ORG: "bardo",
					SENTRY_AUTH_TOKEN: "token",
				},
				() => [
					{
						slug: "other-org",
						name: "other",
					},
				],
			),
		).toBe("bardo");
	});
});
