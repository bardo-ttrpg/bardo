import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WEBSITE_ROOT = process.cwd();

function read(relativePath: string) {
	return readFileSync(join(WEBSITE_ROOT, relativePath), "utf8");
}

describe("landing surface", () => {
	test("homepage composes the exported template sections", () => {
		const pageSource = read("app/(site)/page.tsx");

		expect(pageSource).toContain('id="overview"');
		expect(pageSource).toContain('id="features"');
		expect(pageSource).toContain('id="integrations"');
		expect(pageSource).toContain('id="benefits"');
		expect(pageSource).toContain('id="reviews"');
		expect(pageSource).toContain('id="pricing"');
		expect(pageSource).toContain('id="compliance"');
		expect(pageSource).toContain('id="faq"');
	});

	test("ships the exported contact and privacy routes instead of the old docs shell", () => {
		expect(existsSync(join(WEBSITE_ROOT, "app/(site)/contact/page.tsx"))).toBe(
			true,
		);
		expect(
			existsSync(join(WEBSITE_ROOT, "app/(site)/privacy-policy/page.tsx")),
		).toBe(true);
		const layoutSource = read("app/(site)/layout.tsx");
		expect(layoutSource).not.toContain('{ href: "/docs", label: "Docs" }');
		expect(layoutSource).not.toContain(
			'{ href: "/pricing", label: "Pricing" }',
		);
	});
});
