import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import robots from "./robots";
import sitemap from "./sitemap";

const rootLayoutSource = readFileSync(
	new URL("./layout.tsx", import.meta.url),
	"utf8",
);
const signInSource = readFileSync(
	new URL("./(site)/sign-in/[[...sign-in]]/page.tsx", import.meta.url),
	"utf8",
);
const signUpSource = readFileSync(
	new URL("./(site)/sign-up/[[...sign-up]]/page.tsx", import.meta.url),
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
		expect(dashboardPageSource).toContain("createPrivateMetadata");
		const removedLegacyPath = path.join(
			new URL("./(site)", import.meta.url).pathname,
			["onboard", "ing"].join(""),
			"page.tsx",
		);
		expect(existsSync(removedLegacyPath)).toBe(false);
	});

	test("publishes a robots policy that protects private and API paths", () => {
		const policy = robots();
		expect(policy.host).toBe("www.bardo.gg");
		expect(policy.sitemap).toBe("https://www.bardo.gg/sitemap.xml");
		expect(policy.rules).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					userAgent: "*",
					allow: expect.arrayContaining(["/", "/contact", "/privacy-policy"]),
					disallow: expect.arrayContaining([
						"/api/",
						"/dashboard",
						"/sign-in",
						"/sign-up",
					]),
				}),
			]),
		);
	});

	test("publishes a sitemap for the exported public marketing routes", () => {
		const entries = sitemap().map((entry) => entry.url);
		for (const expected of [
			"https://www.bardo.gg/",
			"https://www.bardo.gg/contact",
			"https://www.bardo.gg/privacy-policy",
		]) {
			expect(entries.includes(expected)).toBe(true);
		}
	});
});
