import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	listDocsEntries,
	listDocsGroupsWithEntries,
	listDocsStaticParams,
	searchDocsEntries,
} from "@/content/site-content";

const docsRouteSource = readFileSync(
	new URL("./[[...slug]]/page.tsx", import.meta.url),
	"utf8",
);
const docsLayoutSource = readFileSync(
	new URL("./layout.tsx", import.meta.url),
	"utf8",
);
const docsShellSource = readFileSync(
	new URL("./_components/docs-shell.tsx", import.meta.url),
	"utf8",
);
const installDocSource = readFileSync(
	new URL("../../../content/docs/install.mdx", import.meta.url),
	"utf8",
);

describe("docs content", () => {
	test("drives docs from a local manifest and static params", () => {
		expect(listDocsEntries().map((entry) => entry.href)).toEqual([
			"/docs",
			"/docs/install",
			"/docs/connect-client",
			"/docs/campaign-truth",
		]);
		expect(listDocsStaticParams()).toEqual([
			{ slug: [] },
			{ slug: ["install"] },
			{ slug: ["connect-client"] },
			{ slug: ["campaign-truth"] },
		]);
	});

	test("keeps grouped navigation, section metadata, and pager order in one manifest", () => {
		expect(
			listDocsGroupsWithEntries().map((group) => ({
				label: group.label,
				hrefs: group.entries.map((entry) => entry.href),
			})),
		).toEqual([
			{
				label: "Get Started",
				hrefs: ["/docs", "/docs/install", "/docs/connect-client"],
			},
			{
				label: "Product Model",
				hrefs: ["/docs/campaign-truth"],
			},
		]);

		expect(
			listDocsEntries().map((entry) => ({
				href: entry.href,
				previousHref: entry.previousHref,
				nextHref: entry.nextHref,
				sectionCount: entry.sections.length,
			})),
		).toEqual([
			{
				href: "/docs",
				previousHref: null,
				nextHref: "/docs/install",
				sectionCount: 3,
			},
			{
				href: "/docs/install",
				previousHref: "/docs",
				nextHref: "/docs/connect-client",
				sectionCount: 3,
			},
			{
				href: "/docs/connect-client",
				previousHref: "/docs/install",
				nextHref: "/docs/campaign-truth",
				sectionCount: 3,
			},
			{
				href: "/docs/campaign-truth",
				previousHref: "/docs/connect-client",
				nextHref: null,
				sectionCount: 3,
			},
		]);
	});

	test("builds lightweight local docs search data from the same source of truth", () => {
		expect(searchDocsEntries("linux").map((entry) => entry.href)).toContain(
			"/docs/install#macos-linux",
		);
		expect(
			searchDocsEntries("remote service boundary").some(
				(entry) =>
					entry.href === "/docs/campaign-truth#remote-service-boundary",
			),
		).toBe(true);
	});

	test("uses a single catch-all route with static params instead of per-page docs files", () => {
		expect(docsRouteSource).toContain("export const dynamicParams = false");
		expect(docsRouteSource).toContain("generateStaticParams");
		expect(docsRouteSource).toContain("getDocsEntryBySlug");
		expect(docsRouteSource).not.toContain("redirect(");
	});

	test("renders docs inside the dedicated docs layout shell", () => {
		expect(docsLayoutSource).toContain("DocsShell");
		expect(docsLayoutSource).toContain("listDocsGroupsWithEntries");
		expect(docsLayoutSource).toContain("listDocsSearchEntries");
		expect(docsShellSource).toContain("Search docs");
		expect(docsShellSource).toContain("On this page");
		expect(docsShellSource).toContain("isActive={pathname === entry.href}");
	});

	test("keeps the install page as a simple text-first document", () => {
		expect(installDocSource).not.toContain("InstallCommandSurface");
		expect(installDocSource).toContain(
			"curl -fsSL https://bardo.gg/install | sh",
		);
		expect(installDocSource).toContain(
			"irm https://bardo.gg/install.ps1 | iex",
		);
	});
});
