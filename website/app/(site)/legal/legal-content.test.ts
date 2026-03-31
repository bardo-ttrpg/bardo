import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const legalIndexSource = readFileSync(
	new URL("./page.tsx", import.meta.url),
	"utf8",
);
const privacySource = readFileSync(
	new URL("./privacy/page.tsx", import.meta.url),
	"utf8",
);
const termsSource = readFileSync(
	new URL("./terms/page.tsx", import.meta.url),
	"utf8",
);
const aiPolicySource = readFileSync(
	new URL("./ai-policy/page.tsx", import.meta.url),
	"utf8",
);

describe("legal content", () => {
	test("keeps legal pages as first-class public routes", () => {
		expect(legalIndexSource).toContain("Terms");
		expect(legalIndexSource).toContain("Privacy");
		expect(legalIndexSource).toContain("AI policy");
		expect(privacySource).toContain("Effective");
		expect(termsSource).toContain("Use of service");
		expect(aiPolicySource).toContain("Acceptable use");
		expect(legalIndexSource).not.toContain("redirect(");
		expect(privacySource).not.toContain("redirect(");
		expect(termsSource).not.toContain("redirect(");
		expect(aiPolicySource).not.toContain("redirect(");
	});
});
