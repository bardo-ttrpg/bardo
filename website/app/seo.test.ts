import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { listLegalEntries } from "../content/legal-content";
import { listBlogEntries, listDocsEntries } from "../content/site-content";
import {
	getDocsBreadcrumbJsonLd,
	getLegalBreadcrumbJsonLd,
} from "../lib/site-seo";
import manifest from "./manifest";
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
const dashboardPageSource = readFileSync(
	new URL("./(site)/dashboard/page.tsx", import.meta.url),
	"utf8",
);
const homeSource = readFileSync(
	new URL("./(site)/page.tsx", import.meta.url),
	"utf8",
);
const docsPageSource = readFileSync(
	new URL("./(site)/docs/[[...slug]]/page.tsx", import.meta.url),
	"utf8",
);
const pricingPageSource = readFileSync(
	new URL("./(site)/(public-secondary)/pricing/page.tsx", import.meta.url),
	"utf8",
);
const legalShellSource = readFileSync(
	new URL(
		"./(site)/(public-secondary)/legal/_components/legal-shell.tsx",
		import.meta.url,
	),
	"utf8",
);
const siteSeoSource = readFileSync(
	new URL("../lib/site-seo.ts", import.meta.url),
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
		expect(rootLayoutSource).toContain("manifest");
	});

	test("ships file-based discovery routes for robots, sitemap, manifest, icons, og, twitter, and not found", () => {
		expect(existsSync(new URL("./robots.ts", import.meta.url))).toBe(true);
		expect(existsSync(new URL("./sitemap.ts", import.meta.url))).toBe(true);
		expect(existsSync(new URL("./manifest.ts", import.meta.url))).toBe(true);
		expect(existsSync(new URL("./opengraph-image.tsx", import.meta.url))).toBe(
			true,
		);
		expect(existsSync(new URL("./twitter-image.tsx", import.meta.url))).toBe(
			true,
		);
		expect(existsSync(new URL("./favicon.ico", import.meta.url))).toBe(true);
		expect(existsSync(new URL("./icon.png", import.meta.url))).toBe(true);
		expect(existsSync(new URL("./apple-icon.png", import.meta.url))).toBe(
			false,
		);
		expect(existsSync(new URL("./icon.tsx", import.meta.url))).toBe(false);
		expect(existsSync(new URL("./apple-icon.tsx", import.meta.url))).toBe(
			false,
		);
		expect(existsSync(new URL("./not-found.tsx", import.meta.url))).toBe(true);
	});

	test("keeps private routes out of search indexes", () => {
		expect(signInSource).toContain("createPrivateMetadata");
		expect(signUpSource).toContain("createPrivateMetadata");
		expect(dashboardPageSource).toContain("createPrivateMetadata");
	});

	test("publishes a robots policy for the public minimal surface", () => {
		const policy = robots();
		const rules = Array.isArray(policy.rules) ? policy.rules : [policy.rules];
		const publicRules = rules.find((rule) => rule.userAgent === "*");
		expect(policy.host).toBe("www.bardo.gg");
		expect(policy.sitemap).toBe("https://www.bardo.gg/sitemap.xml");
		expect(rules).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					userAgent: "*",
					allow: expect.arrayContaining([
						"/",
						"/docs",
						"/blog",
						"/pricing",
						"/legal/data-use",
						"/legal/security",
					]),
					disallow: expect.arrayContaining([
						"/api/",
						"/dashboard",
						"/sign-in",
						"/sign-up",
					]),
				}),
			]),
		);
		expect(publicRules?.allow).not.toContain("/legal/ai-policy");
	});

	test("publishes a sitemap for the retained public routes", () => {
		const entries = sitemap().map((entry) => entry.url);
		const expectedRoutes = [
			"https://www.bardo.gg/",
			"https://www.bardo.gg/docs",
			"https://www.bardo.gg/blog",
			"https://www.bardo.gg/pricing",
			...listLegalEntries().map((entry) => `https://www.bardo.gg${entry.href}`),
			...listDocsEntries()
				.filter((entry) => entry.href !== "/docs")
				.map((entry) => `https://www.bardo.gg${entry.href}`),
			...listBlogEntries().map((entry) => `https://www.bardo.gg${entry.href}`),
		];

		for (const expected of expectedRoutes) {
			expect(entries.includes(expected)).toBe(true);
		}
		expect(entries.includes("https://www.bardo.gg/legal/ai-policy")).toBe(
			false,
		);
	});

	test("publishes a web manifest aligned with the public product surface", () => {
		const data = manifest();
		expect(data.name).toBe("Bardo");
		expect(data.start_url).toBe("/");
		expect(data.icons?.some((icon) => icon.src === "/icon.png")).toBe(true);
		expect(data.icons?.some((icon) => icon.src === "/apple-icon")).toBe(false);
	});

	test("keeps the landing page copy untouched while adding structured data and niche-targeted metadata", () => {
		expect(homeSource).toContain(
			"Bardo is the MCP for playing any tabletop role-playing game.",
		);
		expect(homeSource).toContain('type="application/ld+json"');
		expect(siteSeoSource).toContain("SoftwareApplication");
		expect(siteSeoSource).toContain("WebSite");
		expect(siteSeoSource).toContain("Organization");
		expect(siteSeoSource).toContain("many modern AI clients");
		expect(siteSeoSource).toContain("solo tabletop RPG");
		expect(siteSeoSource).toContain("AI dungeon master");
		expect(siteSeoSource).toContain("AI game master");
	});

	test("adds pricing metadata and structured data for subscription discovery", () => {
		expect(pricingPageSource).toContain('type="application/ld+json"');
		expect(pricingPageSource).toContain("pricingSeo");
		expect(siteSeoSource).toContain("getPricingPageJsonLd");
		expect(siteSeoSource).toContain("Bardo Pro Monthly");
		expect(siteSeoSource).toContain("Bardo Pro Yearly");
	});

	test("adds docs breadcrumb structured data from the docs manifest", () => {
		const installEntry = listDocsEntries().find(
			(entry) => entry.href === "/docs/install",
		);
		if (!installEntry) {
			throw new Error("Expected install docs entry to exist.");
		}

		const breadcrumb = getDocsBreadcrumbJsonLd(installEntry);
		expect(breadcrumb["@type"]).toBe("BreadcrumbList");
		expect(breadcrumb.itemListElement.map((item) => item.name)).toEqual([
			"Bardo",
			"Docs",
			"Install Bardo",
		]);
		expect(docsPageSource).toContain('type="application/ld+json"');
		expect(siteSeoSource).toContain("BreadcrumbList");
	});

	test("adds legal breadcrumb structured data from the legal manifest", () => {
		const securityEntry = listLegalEntries().find(
			(entry) => entry.href === "/legal/security",
		);
		if (!securityEntry) {
			throw new Error("Expected security legal entry to exist.");
		}

		const breadcrumb = getLegalBreadcrumbJsonLd(securityEntry);
		expect(breadcrumb["@type"]).toBe("BreadcrumbList");
		expect(breadcrumb.itemListElement.map((item) => item.name)).toEqual([
			"Bardo",
			"Legal",
			"Security",
		]);
		expect(legalShellSource).toContain('type="application/ld+json"');
		expect(siteSeoSource).toContain("getLegalBreadcrumbJsonLd");
	});
});
