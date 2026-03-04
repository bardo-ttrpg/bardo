import { describe, expect, test } from "bun:test";
import { isNavPathCurrent } from "./nav-paths";

describe("isNavPathCurrent", () => {
	test("matches exact paths", () => {
		expect(isNavPathCurrent("/pricing", "/pricing")).toBe(true);
	});

	test("matches nested paths under a section", () => {
		expect(isNavPathCurrent("/dashboard/settings", "/dashboard")).toBe(true);
	});

	test("does not treat root as matching every path", () => {
		expect(isNavPathCurrent("/pricing", "/")).toBe(false);
	});

	test("does not match unrelated paths", () => {
		expect(isNavPathCurrent("/legal", "/pricing")).toBe(false);
	});

	test("ignores trailing slashes", () => {
		expect(isNavPathCurrent("/pricing/", "/pricing")).toBe(true);
		expect(isNavPathCurrent("/pricing", "/pricing/")).toBe(true);
	});
});
