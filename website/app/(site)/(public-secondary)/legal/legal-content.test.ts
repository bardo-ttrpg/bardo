import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { listLegalEntries } from "../../../../content/legal-content";

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
const dataUseSource = readFileSync(
	new URL("./data-use/page.tsx", import.meta.url),
	"utf8",
);
const securitySource = readFileSync(
	new URL("./security/page.tsx", import.meta.url),
	"utf8",
);
const aiPolicySource = readFileSync(
	new URL("./ai-policy/page.tsx", import.meta.url),
	"utf8",
);

describe("legal content", () => {
	test("keeps only the canonical legal pages as first-class public routes", () => {
		expect(listLegalEntries().map((entry) => entry.href)).toEqual([
			"/legal/terms",
			"/legal/privacy",
			"/legal/data-use",
			"/legal/security",
		]);
		expect(listLegalEntries().map((entry) => entry.navigationLabel)).toEqual([
			"Terms",
			"Privacy",
			"Data Use",
			"Security",
		]);
		expect(legalIndexSource).toContain('permanentRedirect("/legal/terms")');
		expect(privacySource).toContain("no sale of user data");
		expect(termsSource).toContain("No refunds");
		expect(termsSource).toContain("AS IS");
		expect(dataUseSource).toContain("local campaign files stay local");
		expect(securitySource).toContain("high-level overview only");
		expect(aiPolicySource).toContain('permanentRedirect("/legal/terms")');
	});

	test("redirects deprecated or index legal routes to terms", () => {
		expect(legalIndexSource).toContain('permanentRedirect("/legal/terms")');
		expect(aiPolicySource).toContain('permanentRedirect("/legal/terms")');
	});

	test("does not redirect the canonical legal pages", () => {
		expect(privacySource).not.toContain("redirect(");
		expect(termsSource).not.toContain("redirect(");
		expect(dataUseSource).not.toContain("redirect(");
		expect(securitySource).not.toContain("redirect(");
	});
});
