import { describe, expect, test } from "bun:test";
import {
	createBrowserSentryOptions,
	getBrowserSentryConfigWarning,
} from "./sentry-browser-config";

describe("createBrowserSentryOptions", () => {
	test("uses only public browser env values", () => {
		const options = createBrowserSentryOptions({
			NEXT_PUBLIC_SENTRY_DSN: "https://browser@example.ingest.sentry.io/2",
			NEXT_PUBLIC_SENTRY_ENVIRONMENT: "staging",
			NEXT_PUBLIC_SENTRY_RELEASE: "website@browser-release",
			NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0.1",
			SENTRY_ENVIRONMENT: "production",
			SENTRY_RELEASE: "website@server-release",
			NODE_ENV: "production",
		});

		expect(options).toEqual({
			dsn: "https://browser@example.ingest.sentry.io/2",
			enabled: true,
			environment: "staging",
			release: "website@browser-release",
			tracesSampleRate: 0.1,
			enableLogs: true,
			sendDefaultPii: false,
		});
	});

	test("disables browser Sentry in non-development builds when the public environment is missing", () => {
		const options = createBrowserSentryOptions({
			NEXT_PUBLIC_SENTRY_DSN: "https://browser@example.ingest.sentry.io/2",
			NODE_ENV: "production",
		});

		expect(options.enabled).toBe(false);
		expect(options.environment).toBeUndefined();
		expect(options.release).toBeUndefined();
	});

	test("falls back to development environment during local development only", () => {
		const options = createBrowserSentryOptions({
			NEXT_PUBLIC_SENTRY_DSN: "https://browser@example.ingest.sentry.io/2",
			NODE_ENV: "development",
		});

		expect(options.enabled).toBe(true);
		expect(options.environment).toBe("development");
	});
});

describe("getBrowserSentryConfigWarning", () => {
	test("warns when browser Sentry would otherwise mislabel a non-development build", () => {
		expect(
			getBrowserSentryConfigWarning({
				NEXT_PUBLIC_SENTRY_DSN: "https://browser@example.ingest.sentry.io/2",
				NODE_ENV: "production",
			}),
		).toContain("NEXT_PUBLIC_SENTRY_ENVIRONMENT");
	});

	test("does not warn when browser Sentry is correctly configured", () => {
		expect(
			getBrowserSentryConfigWarning({
				NEXT_PUBLIC_SENTRY_DSN: "https://browser@example.ingest.sentry.io/2",
				NEXT_PUBLIC_SENTRY_ENVIRONMENT: "production",
				NODE_ENV: "production",
			}),
		).toBeUndefined();
	});
});
