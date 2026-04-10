import { describe, expect, test } from "bun:test";
import { migrateSavedConfig } from "./saved-config";

describe("saved config", () => {
	test("migrates a versionless config into version 1", () => {
		const migrated = migrateSavedConfig({
			apiKey: "test-key",
			url: "https://example.com/mcp",
			updatedAtISO: "2026-03-04T00:00:00.000Z",
			serverName: "bardo",
		});

		expect(migrated).toEqual({
			version: 1,
			apiKey: "test-key",
			url: "https://example.com/mcp",
			updatedAtISO: "2026-03-04T00:00:00.000Z",
			serverName: "bardo",
		});
	});

	test("accepts version 2 bridge-session config", () => {
		const migrated = migrateSavedConfig({
			version: 2,
			accessToken: "bridge_access_token",
			refreshToken: "bridge_refresh_token",
			expiresAtISO: "2026-03-04T00:10:00.000Z",
			url: "https://example.com/mcp",
			updatedAtISO: "2026-03-04T00:00:00.000Z",
			serverName: "bardo",
			statusUrl: "https://example.com/api/connect/runtime-status",
			refreshUrl: "https://example.com/api/connect/bridge-session/refresh",
			accountLabel: "Armando",
			plan: "solo",
		});

		expect(migrated).toEqual({
			version: 2,
			accessToken: "bridge_access_token",
			refreshToken: "bridge_refresh_token",
			expiresAtISO: "2026-03-04T00:10:00.000Z",
			url: "https://example.com/mcp",
			updatedAtISO: "2026-03-04T00:00:00.000Z",
			serverName: "bardo",
			statusUrl: "https://example.com/api/connect/runtime-status",
			refreshUrl: "https://example.com/api/connect/bridge-session/refresh",
			accountLabel: "Armando",
			plan: "solo",
		});
	});

	test("rewrites legacy app.bardo.ai bridge URLs to www.bardo.gg", () => {
		const migrated = migrateSavedConfig({
			version: 2,
			accessToken: "bridge_access_token",
			refreshToken: "bridge_refresh_token",
			expiresAtISO: "2026-03-04T00:10:00.000Z",
			url: "https://example.com/mcp",
			updatedAtISO: "2026-03-04T00:00:00.000Z",
			statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
			refreshUrl: "https://app.bardo.ai/api/connect/bridge-session/refresh",
		});

		expect(migrated).toMatchObject({
			statusUrl: "https://www.bardo.gg/api/connect/runtime-status",
			refreshUrl: "https://www.bardo.gg/api/connect/bridge-session/refresh",
		});
	});

	test("rejects unsupported config versions", () => {
		expect(
			migrateSavedConfig({
				version: 3,
				apiKey: "test-key",
				url: "https://example.com/mcp",
			}),
		).toBeNull();
	});

	test("rejects malformed required fields", () => {
		expect(
			migrateSavedConfig({
				version: 1,
				apiKey: 123,
				url: "https://example.com/mcp",
			}),
		).toBeNull();
	});
});
