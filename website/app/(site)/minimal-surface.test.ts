import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const homeSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const notFoundSource = readFileSync(
	new URL("../not-found.tsx", import.meta.url),
	"utf8",
);
const explicit404Source = readFileSync(
	new URL("./404/page.tsx", import.meta.url),
	"utf8",
);

describe("minimal public surface", () => {
	test("ships a text-first homepage instead of the old Framer template", () => {
		expect(homeSource).toContain('href="/docs"');
		expect(homeSource).toContain('href="/dashboard"');
		expect(homeSource).toContain('href="/sign-in"');
		expect(homeSource).toContain("Some of the most useful pages include:");
		expect(homeSource).not.toContain("FramerTemplatePage");
	});

	test("removes the old public marketing routes", () => {
		expect(existsSync(new URL("./contact/page.tsx", import.meta.url))).toBe(
			false,
		);
		expect(existsSync(new URL("./pricing/page.tsx", import.meta.url))).toBe(
			false,
		);
		expect(
			existsSync(new URL("./privacy-policy/page.tsx", import.meta.url)),
		).toBe(false);
	});

	test("shares one minimal 404 experience", () => {
		expect(notFoundSource).toContain("Minimal404Page");
		expect(explicit404Source).toContain("Minimal404Page");
		expect(notFoundSource).not.toContain("FramerTemplatePage");
		expect(explicit404Source).not.toContain("FramerTemplatePage");
	});
});
