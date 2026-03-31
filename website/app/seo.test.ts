import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { listBlogEntries, listDocsEntries } from "@/content/site-content";
import robots from "./robots";
import sitemap from "./sitemap";

const rootLayoutSource = readFileSync(
	new URL("./layout.tsx", import.meta.url),
	"utf8",
);
const signInSource = readFileSync(
	new URL("./(site)/(auth)/sign-in/[[...sign-in]]/page.tsx", import.meta.url),
	"utf8",
);
const signUpSource = readFileSync(
	new URL("./(site)/(auth)/sign-up/[[...sign-up]]/page.tsx", import.meta.url),
	"utf8",
);
const forgotPasswordSource = readFileSync(
	new URL("./(site)/(auth)/forgot-password/page.tsx", import.meta.url),
	"utf8",
);
const dashboardPageSource = readFileSync(
	new URL("./(site)/dashboard/page.tsx", import.meta.url),
	"utf8",
);

describe("SEO and production metadata", () => {
	test("sets strong root metadata for search and social discovery", () => {
		expect(rootLayoutSource).toContain("metadataBase");
		expect(rootLayoutSource).toContain("openGraph");
		expect(rootLayoutSource).toContain("twitter");
		expect(rootLayoutSource).toContain("robots");
		expect(rootLayoutSource).toContain("alternates");
		expect(rootLayoutSource).toContain("referrer");
		expect(rootLayoutSource).toContain("publisher");
	});

	test("ships file-based discovery routes for robots, sitemap, og, twitter, and not found", () => {
		expect(existsSync(new URL("./robots.ts", import.meta.url))).toBe(true);
		expect(existsSync(new URL("./sitemap.ts", import.meta.url))).toBe(true);
		expect(existsSync(new URL("./opengraph-image.tsx", import.meta.url))).toBe(
			true,
		);
		expect(existsSync(new URL("./twitter-image.tsx", import.meta.url))).toBe(
			true,
		);
		expect(existsSync(new URL("./icon.svg", import.meta.url))).toBe(true);
		expect(existsSync(new URL("./not-found.tsx", import.meta.url))).toBe(true);
	});

	test("keeps private routes out of search indexes", () => {
		expect(signInSource).toContain("createPrivateMetadata");
		expect(signUpSource).toContain("createPrivateMetadata");
		expect(forgotPasswordSource).toContain("createPrivateMetadata");
		expect(dashboardPageSource).toContain("createPrivateMetadata");
	});

	test("publishes a robots policy for the public minimal surface", () => {
		const policy = robots();
		expect(policy.host).toBe("www.bardo.gg");
		expect(policy.sitemap).toBe("https://www.bardo.gg/sitemap.xml");
		expect(policy.rules).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					userAgent: "*",
					allow: expect.arrayContaining(["/", "/docs", "/blog", "/legal"]),
					disallow: expect.arrayContaining([
						"/api/",
						"/dashboard",
						"/sign-in",
						"/sign-up",
						"/forgot-password",
					]),
				}),
			]),
		);
	});

	test("publishes a sitemap for the retained public routes", () => {
		const entries = sitemap().map((entry) => entry.url);
		const expectedRoutes = [
			"https://www.bardo.gg/",
			"https://www.bardo.gg/docs",
			"https://www.bardo.gg/blog",
			"https://www.bardo.gg/legal",
			"https://www.bardo.gg/legal/terms",
			"https://www.bardo.gg/legal/privacy",
			"https://www.bardo.gg/legal/ai-policy",
			...listDocsEntries()
				.filter((entry) => entry.href !== "/docs")
				.map((entry) => `https://www.bardo.gg${entry.href}`),
			...listBlogEntries().map((entry) => `https://www.bardo.gg${entry.href}`),
		];

		for (const expected of expectedRoutes) {
			expect(entries.includes(expected)).toBe(true);
		}
	});
});
