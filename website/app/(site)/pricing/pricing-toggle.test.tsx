import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const pricingToggleSource = readFileSync(
	new URL("./pricing-toggle.tsx", import.meta.url),
	"utf8",
);

describe("PricingToggle", () => {
	test("uses a single bordered grid shell without decorative corner markers", () => {
		expect(pricingToggleSource).toContain('data-pricing-grid="true"');
		expect(pricingToggleSource).not.toContain("data-corner-marker");
	});
});
