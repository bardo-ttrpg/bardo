import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const docsIndexSource = readFileSync(
	new URL("./page.tsx", import.meta.url),
	"utf8",
);
const installDocsSource = readFileSync(
	new URL("./install/page.tsx", import.meta.url),
	"utf8",
);
const connectClientDocsSource = readFileSync(
	new URL("./connect-client/page.tsx", import.meta.url),
	"utf8",
);
const campaignTruthDocsSource = readFileSync(
	new URL("./campaign-truth/page.tsx", import.meta.url),
	"utf8",
);
const creditsDocsSource = readFileSync(
	new URL("./credits-and-billing/page.tsx", import.meta.url),
	"utf8",
);
const pricingPageSource = readFileSync(
	new URL("../pricing/page.tsx", import.meta.url),
	"utf8",
);
const legalIndexSource = readFileSync(
	new URL("../legal/page.tsx", import.meta.url),
	"utf8",
);

describe("legacy public routes", () => {
	test("redirect docs entry points into the new template sections", () => {
		expect(docsIndexSource).toContain('redirect("/#overview")');
		expect(installDocsSource).toContain('redirect("/#overview")');
		expect(connectClientDocsSource).toContain('redirect("/#integrations")');
		expect(campaignTruthDocsSource).toContain('redirect("/#about")');
		expect(creditsDocsSource).toContain('redirect("/#pricing")');
	});

	test("redirect pricing and legal index routes into the exported surface", () => {
		expect(pricingPageSource).toContain('redirect("/#pricing")');
		expect(legalIndexSource).toContain('redirect("/privacy-policy")');
	});
});
