import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WEBSITE_ROOT = process.cwd();

function read(relativePath: string) {
	return readFileSync(join(WEBSITE_ROOT, relativePath), "utf8");
}

describe("PR #30 landing surface", () => {
	test("homepage composes the Codex-style landing sections", () => {
		const pageSource = read("app/(site)/page.tsx");

		expect(pageSource).toContain("CodexHeroSection");
		expect(pageSource).toContain("LogoCarousel");
		expect(pageSource).toContain("AgentFeaturesSection");
		expect(pageSource).toContain("TestimonialsSection");
		expect(pageSource).toContain("IdeDemoSection");
	});

	test("does not ship a dedicated codex route or top-level navigation entry", () => {
		expect(existsSync(join(WEBSITE_ROOT, "app/(site)/codex/page.tsx"))).toBe(
			false,
		);
		const layoutSource = read("app/(site)/layout.tsx");
		expect(layoutSource).not.toContain('{ href: "/codex", label: "Codex" }');
	});
});
