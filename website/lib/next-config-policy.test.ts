import { describe, expect, test } from "bun:test";
import {
	resolveAllowedDevOrigins,
	resolveSecurityHeaders,
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

describe("resolveSecurityHeaders", () => {
	test("returns a strict baseline with no HSTS in non-production", () => {
		const headers = resolveSecurityHeaders({
			NODE_ENV: "development",
			VERCEL_ENV: "preview",
		});
		const headerMap = new Map(headers.map((entry) => [entry.key, entry.value]));

		expect(headerMap.get("X-Frame-Options")).toBe("DENY");
		expect(headerMap.get("X-Content-Type-Options")).toBe("nosniff");
		expect(headerMap.get("Referrer-Policy")).toBe(
			"strict-origin-when-cross-origin",
		);
		expect(headerMap.get("Strict-Transport-Security")).toBeUndefined();
		expect(headerMap.get("Content-Security-Policy")).toContain(
			"default-src 'self'",
		);
	});

	test("includes HSTS and upgrade-insecure-requests in production", () => {
		const headers = resolveSecurityHeaders({
			VERCEL_ENV: "production",
		});
		const headerMap = new Map(headers.map((entry) => [entry.key, entry.value]));
		const csp = headerMap.get("Content-Security-Policy") ?? "";

		expect(headerMap.get("Strict-Transport-Security")).toBe(
			"max-age=63072000; includeSubDomains; preload",
		);
		expect(csp).toContain("upgrade-insecure-requests");
		expect(csp).not.toContain("'unsafe-eval'");
	});

	test("can disable unsafe-inline scripts in production with an explicit env flag", () => {
		const headers = resolveSecurityHeaders({
			VERCEL_ENV: "production",
			BARDO_CSP_ALLOW_UNSAFE_INLINE_SCRIPTS: "false",
		});
		const csp =
			headers.find((header) => header.key === "Content-Security-Policy")
				?.value ?? "";

		expect(csp).not.toContain("script-src 'self' 'unsafe-inline' https:");
		expect(csp).toContain("script-src 'self' https:");
	});
});
