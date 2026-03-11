import { describe, expect, test } from "bun:test";
import {
	resolvePlaywrightBaseUrl,
	resolvePlaywrightExtraHttpHeaders,
	resolvePlaywrightLocalAppUrl,
	resolvePlaywrightWebServerHost,
	resolvePlaywrightWebServerPort,
} from "./playwright-config-lib";

describe("playwright config helpers", () => {
	test("keeps the local web server bound to loopback when base URL points remote", () => {
		const env = {
			PLAYWRIGHT_BASE_URL: "https://staging.example.com",
		};

		expect(resolvePlaywrightBaseUrl(env, 3001)).toBe(
			"https://staging.example.com",
		);
		expect(
			resolvePlaywrightWebServerHost(env, "https://staging.example.com"),
		).toBe("localhost");
		expect(
			resolvePlaywrightWebServerPort(env, "https://staging.example.com", 3001),
		).toBe(3001);
	});

	test("prefers an explicit loopback host override", () => {
		const env = {
			PLAYWRIGHT_BASE_URL: "https://staging.example.com",
			PLAYWRIGHT_LOOPBACK_HOST: "localhost",
			PLAYWRIGHT_PORT: "4010",
		};

		expect(
			resolvePlaywrightWebServerHost(env, "https://staging.example.com"),
		).toBe("localhost");
		expect(
			resolvePlaywrightWebServerPort(env, "https://staging.example.com", 3001),
		).toBe(4010);
	});

	test("derives a local app url that matches the loopback host and port", () => {
		expect(resolvePlaywrightLocalAppUrl("127.0.0.1", 3001)).toBe(
			"http://127.0.0.1:3001",
		);
		expect(resolvePlaywrightLocalAppUrl("::1", 3001)).toBe("http://[::1]:3001");
	});

	test("returns empty extra headers when no protection bypass secret is configured", () => {
		expect(resolvePlaywrightExtraHttpHeaders({})).toEqual({});
	});

	test("returns automation bypass headers when a protection secret is configured", () => {
		expect(
			resolvePlaywrightExtraHttpHeaders({
				PLAYWRIGHT_VERCEL_PROTECTION_BYPASS_SECRET: "secret-123",
			}),
		).toEqual({
			"x-vercel-protection-bypass": "secret-123",
			"x-vercel-set-bypass-cookie": "true",
		});
	});
});
