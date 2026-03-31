import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { listDocsEntries, listDocsStaticParams } from "@/content/site-content";

const docsRouteSource = readFileSync(
	new URL("./[[...slug]]/page.tsx", import.meta.url),
	"utf8",
);
const docsLayoutSource = readFileSync(
	new URL("./layout.tsx", import.meta.url),
	"utf8",
);

describe("docs content", () => {
	test("drives docs from a local manifest and static params", () => {
		expect(listDocsEntries().map((entry) => entry.href)).toEqual([
			"/docs",
			"/docs/install",
			"/docs/connect-client",
			"/docs/campaign-truth",
			"/docs/credits-and-billing",
		]);
		expect(listDocsStaticParams()).toEqual([
			{ slug: [] },
			{ slug: ["install"] },
			{ slug: ["connect-client"] },
			{ slug: ["campaign-truth"] },
			{ slug: ["credits-and-billing"] },
		]);
	});

	test("uses a single catch-all route with static params instead of per-page docs files", () => {
		expect(docsRouteSource).toContain("export const dynamicParams = false");
		expect(docsRouteSource).toContain("generateStaticParams");
		expect(docsRouteSource).toContain("getDocsEntryBySlug");
		expect(docsRouteSource).not.toContain("redirect(");
	});

	test("renders docs inside the dedicated docs layout shell", () => {
		expect(docsLayoutSource).toContain("DocsShell");
		expect(docsLayoutSource).toContain("listDocsEntries");
	});
});
