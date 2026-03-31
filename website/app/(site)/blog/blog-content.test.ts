import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { listBlogEntries, listBlogStaticParams } from "@/content/site-content";

const blogPageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const blogEntryRouteSource = readFileSync(
	new URL("./[slug]/page.tsx", import.meta.url),
	"utf8",
);

describe("blog content", () => {
	test("drives blog routes from the local manifest and static params", () => {
		expect(listBlogEntries()).toEqual([]);
		expect(listBlogStaticParams()).toEqual([]);
	});

	test("falls back to description when a blog entry preview is missing", () => {
		expect(blogPageSource).toContain("entry.preview ?? entry.description");
	});

	test("uses a single static route for blog entries", () => {
		expect(blogEntryRouteSource).toContain("export const dynamicParams = false");
		expect(blogEntryRouteSource).toContain("generateStaticParams");
		expect(blogEntryRouteSource).toContain("getBlogEntryBySlug");
	});
});
