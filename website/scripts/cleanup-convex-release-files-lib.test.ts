import { describe, expect, test } from "bun:test";
import {
	parseReleaseCleanupArgs,
	releaseCleanupModeFromArgs,
} from "./cleanup-convex-release-files-lib";

describe("Convex release file cleanup CLI safety", () => {
	test("defaults to dry-run mode", () => {
		expect(releaseCleanupModeFromArgs([])).toEqual({
			confirm: false,
			limit: undefined,
		});
	});

	test("requires an explicit confirm flag before deleting release storage", () => {
		expect(releaseCleanupModeFromArgs(["--confirm"])).toEqual({
			confirm: true,
			limit: undefined,
		});
	});

	test("parses a bounded cleanup limit without enabling deletion by itself", () => {
		expect(parseReleaseCleanupArgs(["--limit", "10"])).toEqual({
			confirm: false,
			limit: 10,
		});
	});
});
