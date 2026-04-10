import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { listBlogEntries, listBlogStaticParams } from "../../../../content/site-content";

const blogPageSource = readFileSync(
	new URL("./page.tsx", import.meta.url),
	"utf8",
);
const blogEntryRouteSource = readFileSync(
	new URL("./[slug]/page.tsx", import.meta.url),
	"utf8",
);
const blogShellSource = readFileSync(
	new URL("./_components/blog-shell.tsx", import.meta.url),
	"utf8",
);
const blogLayoutSource = readFileSync(
	new URL("./layout.tsx", import.meta.url),
	"utf8",
);

describe("blog content", () => {
	test("drives blog routes from the local manifest and static params", () => {
		expect(listBlogEntries()).toEqual([]);
		expect(listBlogStaticParams()).toEqual([]);
	});

	test("redirects /blog to the latest published post when one exists", () => {
		expect(blogPageSource).toContain('redirect(latestEntry.href)');
	});

	test("falls back to a no-post state when there is nothing to redirect to", () => {
		expect(blogPageSource).toContain("BlogEmptyState");
		expect(blogShellSource).toContain("No posts are published yet.");
		expect(blogShellSource).toContain("Read the docs");
	});

	test("uses a legal-style blog shell with a left navigation rail", () => {
		expect(blogLayoutSource).toContain("listBlogEntries()");
		expect(blogShellSource).toContain("BlogSidebarNav");
		expect(blogEntryRouteSource).toContain("BlogEntryContent");
	});

	test("falls back to description when a blog entry preview is missing", () => {
		expect(blogShellSource).toContain("entry.preview ?? entry.description");
	});

	test("uses a single static route for blog entries", () => {
		expect(blogEntryRouteSource).toContain(
			"export const dynamicParams = false",
		);
		expect(blogEntryRouteSource).toContain("generateStaticParams");
		expect(blogEntryRouteSource).toContain("getBlogEntryBySlug");
	});
});
