import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("branding surface", () => {
	test("site header uses the icon wordmark link instead of header text", () => {
		const layoutSource = readFileSync(
			new URL("./layout.tsx", import.meta.url),
			"utf8",
		);

		expect(layoutSource).toContain('src="/icon.svg"');
		expect(layoutSource).toContain('aria-label="Bardo"');
		expect(layoutSource).toContain('<Link\n\t\t\t\t\t\thref="/"');
	});

	test("hero wordmark uses the brand font and uppercase BARDO text", () => {
		const heroSource = readFileSync(
			new URL("./_components/landing/codex-hero-section.tsx", import.meta.url),
			"utf8",
		);

		expect(heroSource).toContain("font-brand");
		expect(heroSource).toContain("BARDO");
	});
});
