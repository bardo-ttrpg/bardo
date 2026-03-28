import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("branding surface", () => {
	test("site header uses the Asset icon wordmark and home link", () => {
		const layoutSource = readFileSync(
			new URL("./layout.tsx", import.meta.url),
			"utf8",
		);

		expect(layoutSource).toContain('src="/icon.svg"');
		expect(layoutSource).toContain('aria-label="Asset"');
		expect(layoutSource).toContain('alt="Asset"');
		expect(layoutSource).toContain('href="/"');
	});

	test("site fonts swap to the exported Host Grotesk-first stack", () => {
		const fontSource = readFileSync(
			new URL("../../lib/site-fonts.ts", import.meta.url),
			"utf8",
		);

		expect(fontSource).toContain("Host_Grotesk");
	});
});
