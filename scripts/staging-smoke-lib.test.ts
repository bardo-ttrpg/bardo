import { describe, expect, test } from "bun:test";
import {
	appendVercelProtectionBypass,
	createVercelProtectionHeaders,
	parseJsonOrSseJson,
} from "./staging-smoke-lib";

describe("appendVercelProtectionBypass", () => {
	test("returns the original url when no bypass secret is configured", () => {
		expect(
			appendVercelProtectionBypass(
				"https://example.vercel.app/api/connect/runtime-status",
				"",
			),
		).toBe("https://example.vercel.app/api/connect/runtime-status");
	});

	test("appends the bypass secret as a query parameter", () => {
		expect(
			appendVercelProtectionBypass(
				"https://example.vercel.app/api/connect/runtime-status",
				"secret-123",
			),
		).toBe(
			"https://example.vercel.app/api/connect/runtime-status?x-vercel-protection-bypass=secret-123",
		);
	});

	test("preserves existing query params when appending the bypass secret", () => {
		expect(
			appendVercelProtectionBypass(
				"https://example.vercel.app/api/keys?limit=20&offset=0",
				"secret-123",
			),
		).toBe(
			"https://example.vercel.app/api/keys?limit=20&offset=0&x-vercel-protection-bypass=secret-123",
		);
	});
});

describe("createVercelProtectionHeaders", () => {
	test("returns empty headers when no bypass secret is configured", () => {
		expect(createVercelProtectionHeaders("")).toEqual({});
	});

	test("returns the documented automation bypass headers", () => {
		expect(createVercelProtectionHeaders("secret-123")).toEqual({
			"x-vercel-protection-bypass": "secret-123",
		});
	});

	test("adds the cookie-minting header only when requested", () => {
		expect(
			createVercelProtectionHeaders("secret-123", { setCookie: true }),
		).toEqual({
			"x-vercel-protection-bypass": "secret-123",
			"x-vercel-set-bypass-cookie": "true",
		});
	});
});

describe("parseJsonOrSseJson", () => {
	test("parses a plain JSON response body", () => {
		expect(parseJsonOrSseJson<{ ok: boolean }>('{"ok":true}')).toEqual({
			ok: true,
		});
	});

	test("parses a JSON payload from an SSE message body", () => {
		expect(
			parseJsonOrSseJson<{ result: { protocolVersion: string } }>(
				'event: message\ndata: {"result":{"protocolVersion":"2025-06-18"}}',
			),
		).toEqual({
			result: {
				protocolVersion: "2025-06-18",
			},
		});
	});

	test("throws when the response body is neither JSON nor SSE JSON", () => {
		expect(() => parseJsonOrSseJson("not-json")).toThrow(
			"Response was neither JSON nor SSE JSON.",
		);
	});
});
