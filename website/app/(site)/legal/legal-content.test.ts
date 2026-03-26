import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const legalIndexSource = readFileSync(
	new URL("./page.tsx", import.meta.url),
	"utf8",
);
const termsSource = readFileSync(
	new URL("./terms/page.tsx", import.meta.url),
	"utf8",
);
const privacySource = readFileSync(
	new URL("./privacy/page.tsx", import.meta.url),
	"utf8",
);
const aiPolicySource = readFileSync(
	new URL("./ai-policy/page.tsx", import.meta.url),
	"utf8",
);
const landingSource = readFileSync(
	new URL("../page.tsx", import.meta.url),
	"utf8",
);

describe("legal and landing product copy", () => {
	test("keeps the legal index aligned with the hosted MCP plus local workspace product", () => {
		expect(legalIndexSource).toContain("hosted MCP service");
		expect(legalIndexSource).toContain("local bridge");
		expect(legalIndexSource).toContain("local workspace files");
		expect(legalIndexSource).toContain("monthly credits");
	});

	test("uses current legal contacts and refreshed policy dates", () => {
		expect(termsSource).toContain("March 12, 2026");
		expect(privacySource).toContain("March 12, 2026");
		expect(aiPolicySource).toContain("March 12, 2026");
		expect(termsSource).toContain("legal@bardo.gg");
		expect(privacySource).toContain("privacy@bardo.gg");
		expect(termsSource).not.toContain("bardo.dev");
		expect(privacySource).not.toContain("bardo.dev");
	});

	test("keeps the landing page aligned with the paid remote MCP product", () => {
		expect(landingSource).toContain("Paid remote MCP");
		expect(landingSource).toContain("Browser-approved bridge sessions");
		expect(landingSource).not.toContain('price: "0"');
	});
});
