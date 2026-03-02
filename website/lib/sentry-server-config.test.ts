import { describe, expect, test } from "bun:test";
import {
	createServerSentryOptions,
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
