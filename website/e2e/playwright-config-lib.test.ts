import { describe, expect, test } from "bun:test";
import {
	resolvePlaywrightBaseUrl,
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
		).toBe("127.0.0.1");
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
});
