import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const privacyPolicySource = readFileSync(
	new URL("../privacy-policy/page.tsx", import.meta.url),
	"utf8",
);
const landingSource = readFileSync(
	new URL("../page.tsx", import.meta.url),
	"utf8",
);

describe("privacy and landing product copy", () => {
	test("uses the exported privacy policy date, sections, and contact email", () => {
		expect(privacyPolicySource).toContain("February 17, 2026");
		expect(privacyPolicySource).toContain("1. Information We Collect");
		expect(privacyPolicySource).toContain("8. Changes to This Privacy Policy");
		expect(privacyPolicySource).toContain("contact@asset.com");
	});

	test("keeps the landing page aligned with the exported finance template", () => {
		expect(landingSource).toContain("investing");
		expect(landingSource).toContain("financial analysis");
		expect(landingSource).toContain(
			"Simple pricing that scales with your needs",
		);
	});
});
