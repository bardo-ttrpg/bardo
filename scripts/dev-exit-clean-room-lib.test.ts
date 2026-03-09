import { describe, expect, test } from "bun:test";
import {
	shouldExcludeFromDevExitCleanRoom,
	toPortableRelativePath,
} from "./dev-exit-clean-room-lib";

describe("toPortableRelativePath", () => {
	test("normalizes path separators", () => {
		expect(toPortableRelativePath("website\\test-results\\index.html")).toBe(
			"website/test-results/index.html",
		);
	});
});

describe("shouldExcludeFromDevExitCleanRoom", () => {
	test("excludes generated artifacts and git metadata", () => {
		expect(shouldExcludeFromDevExitCleanRoom(".git/config")).toBe(true);
		expect(
			shouldExcludeFromDevExitCleanRoom("website/.next/server/app.js"),
		).toBe(true);
		expect(
			shouldExcludeFromDevExitCleanRoom(
				"packages/bardo-mcp/test-results/out.json",
			),
		).toBe(true);
	});

	test("keeps source files and lockfiles", () => {
		expect(shouldExcludeFromDevExitCleanRoom("package.json")).toBe(false);
		expect(shouldExcludeFromDevExitCleanRoom("bun.lock")).toBe(false);
		expect(
			shouldExcludeFromDevExitCleanRoom("website/app/(site)/layout.tsx"),
		).toBe(false);
	});
});
