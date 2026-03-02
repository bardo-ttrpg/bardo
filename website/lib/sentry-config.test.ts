import { describe, expect, test } from "bun:test";
import {
	createBrowserSentryOptions,
	createServerSentryOptions,
	resolveSentryRelease,
} from "./sentry-config";

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

describe("createBrowserSentryOptions", () => {
	test("uses public env values for browser release health", () => {
		const options = createBrowserSentryOptions({
			NEXT_PUBLIC_SENTRY_DSN: "https://browser@example.ingest.sentry.io/2",
			NEXT_PUBLIC_SENTRY_ENVIRONMENT: "production",
			SENTRY_RELEASE: "website@def456",
			NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0.1",
		});

		expect(options).toEqual({
			dsn: "https://browser@example.ingest.sentry.io/2",
			enabled: true,
			environment: "production",
			release: "website@def456",
			tracesSampleRate: 0.1,
			enableLogs: true,
			sendDefaultPii: false,
		});
	});

	test("prefers NEXT_PUBLIC_SENTRY_ENVIRONMENT for browser events", () => {
		const options = createBrowserSentryOptions({
			NEXT_PUBLIC_SENTRY_DSN: "https://browser@example.ingest.sentry.io/2",
			NEXT_PUBLIC_SENTRY_ENVIRONMENT: "staging",
			SENTRY_ENVIRONMENT: "production",
			SENTRY_RELEASE: "website@staging",
		});

		expect(options.environment).toBe("staging");
	});

	test("ignores server-only SENTRY_ENVIRONMENT in browser config", () => {
		const options = createBrowserSentryOptions({
			NEXT_PUBLIC_SENTRY_DSN: "https://browser@example.ingest.sentry.io/2",
			SENTRY_ENVIRONMENT: "staging",
			NODE_ENV: "production",
		});

		expect(options.environment).toBe("production");
	});

	test("does not infer browser release from server-only git sha variables", () => {
		const options = createBrowserSentryOptions({
			NEXT_PUBLIC_SENTRY_DSN: "https://browser@example.ingest.sentry.io/2",
			NEXT_PUBLIC_SENTRY_ENVIRONMENT: "production",
			RAILWAY_GIT_COMMIT_SHA: "railway-only-sha",
		});

		expect(options.release).toBeUndefined();
	});

	test("falls back to disabled config when no public dsn exists", () => {
		const options = createBrowserSentryOptions({
			SENTRY_ENVIRONMENT: "development",
		});

		expect(options.enabled).toBe(false);
		expect(options.dsn).toBeUndefined();
		expect(options.sendDefaultPii).toBe(false);
		expect(options.enableLogs).toBe(true);
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
