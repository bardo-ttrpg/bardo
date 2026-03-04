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

	test("rejects unsupported config versions", () => {
		expect(
			migrateSavedConfig({
				version: 2,
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
