import { describe, expect, test } from "bun:test";
import {
	resolveAllowedDevOrigins,
	resolveSentryBuildSilence,
} from "./next-config-policy";

describe("resolveAllowedDevOrigins", () => {
	test("falls back to localhost-only origins when no env override is set", () => {
		expect(resolveAllowedDevOrigins({})).toEqual([
			"127.0.0.1",
			"localhost",
			"::1",
			"[::1]",
		]);
	});

	test("adds env-provided origins without losing localhost defaults", () => {
		expect(
			resolveAllowedDevOrigins({
				BARDO_ALLOWED_DEV_ORIGINS:
					"https://example.ngrok-free.app, https://dev.example.com ",
			}),
		).toEqual([
			"127.0.0.1",
			"localhost",
			"::1",
			"[::1]",
			"https://example.ngrok-free.app",
			"https://dev.example.com",
		]);
	});
});

describe("resolveSentryBuildSilence", () => {
	test("stays silent in local development by default", () => {
		expect(resolveSentryBuildSilence({ NODE_ENV: "development" })).toBe(true);
	});

	test("is noisy in CI and production-like builds by default", () => {
		expect(resolveSentryBuildSilence({ CI: "true" })).toBe(false);
		expect(resolveSentryBuildSilence({ NODE_ENV: "production" })).toBe(false);
		expect(resolveSentryBuildSilence({ VERCEL_ENV: "preview" })).toBe(false);
	});

	test("allows explicit override through BARDO_SENTRY_BUILD_SILENT", () => {
		expect(
			resolveSentryBuildSilence({
				NODE_ENV: "production",
				BARDO_SENTRY_BUILD_SILENT: "true",
			}),
		).toBe(true);
		expect(
			resolveSentryBuildSilence({
				NODE_ENV: "development",
				BARDO_SENTRY_BUILD_SILENT: "false",
			}),
		).toBe(false);
	});
});
