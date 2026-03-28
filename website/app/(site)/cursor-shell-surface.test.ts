import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("template shell surface", () => {
	test("site layout includes the exported overview and information links", () => {
		const layoutSource = readFileSync(
			new URL("./layout.tsx", import.meta.url),
			"utf8",
		);

		expect(layoutSource).toContain("Overview");
		expect(layoutSource).toContain("Features");
		expect(layoutSource).toContain("Contact");
		expect(layoutSource).toContain("Privacy Policy");
	});

	test("homepage includes the exported finance pricing and faq sections", () => {
		const pageSource = readFileSync(
			new URL("./page.tsx", import.meta.url),
			"utf8",
		);

		expect(pageSource).toContain("Simple pricing that scales with your needs");
		expect(pageSource).toContain("Everything explained to");
	});
});
