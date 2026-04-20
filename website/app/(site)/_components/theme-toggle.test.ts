import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./theme-toggle.tsx", import.meta.url), "utf8");

describe("ThemeToggle", () => {
	test("uses the view-transition-aware theme handoff", () => {
		expect(source).toContain("startViewTransition");
		expect(source).toContain("dataset.themeTransition");
	});
});
