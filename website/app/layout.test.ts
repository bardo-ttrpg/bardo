import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const rootLayoutSource = readFileSync(
	new URL("./layout.tsx", import.meta.url),
	"utf8",
);
const globalStylesSource = readFileSync(
	new URL("./globals.css", import.meta.url),
	"utf8",
);
const siteFontsSource = readFileSync(
	new URL("../lib/site-fonts.ts", import.meta.url),
	"utf8",
);
const siteLayoutPath = new URL("./(site)/layout.tsx", import.meta.url);

describe("Clerk provider placement", () => {
	test("wraps the app at the root layout", () => {
		expect(rootLayoutSource).toContain("OptionalClerkProvider");
		expect(rootLayoutSource).toContain("isClerkAuthConfigured");
	});

	test("does not add a no-op layout for the site route group", () => {
		expect(existsSync(siteLayoutPath)).toBe(false);
	});

	test("does not wire marketing analytics into the minimal root layout", () => {
		expect(rootLayoutSource).not.toContain("@vercel/analytics/next");
		expect(rootLayoutSource).not.toContain("@vercel/speed-insights/next");
		expect(rootLayoutSource).not.toContain("<Analytics");
		expect(rootLayoutSource).not.toContain("<SpeedInsights");
	});

	test("defines canonical, social, and robots metadata at the root layout", () => {
		expect(rootLayoutSource).toContain("metadataBase");
		expect(rootLayoutSource).toContain("openGraph");
		expect(rootLayoutSource).toContain("twitter");
		expect(rootLayoutSource).toContain("robots");
		expect(rootLayoutSource).toContain("alternates");
	});

	test("keeps the root layout visually stripped down", () => {
		expect(rootLayoutSource).not.toContain('backgroundColor: "#080a09"');
		expect(rootLayoutSource).toContain('colorScheme: "dark"');
		expect(rootLayoutSource).toContain('themeColor: "#000000"');
		expect(rootLayoutSource).toContain("siteReading.variable");
		expect(rootLayoutSource).toContain("siteUi.variable");
		expect(rootLayoutSource).toContain("siteCode.variable");
	});

	test("uses Newsreader plus Geist Sans and Geist Mono at the root", () => {
		expect(siteFontsSource).toContain("Newsreader");
		expect(siteFontsSource).toContain("GeistSans");
		expect(siteFontsSource).toContain("GeistMono");
		expect(siteFontsSource).not.toContain("Cardo");
		expect(siteFontsSource).not.toContain("Literata");
	});

	test("defines brutalist black and white font and color tokens globally", () => {
		expect(globalStylesSource).toContain("--font-reading");
		expect(globalStylesSource).toContain("--font-ui");
		expect(globalStylesSource).toContain("--font-code");
		expect(globalStylesSource).toContain("--color-background: #000000");
		expect(globalStylesSource).toContain("--color-foreground: #ffffff");
		expect(globalStylesSource).toContain(
			'font-variation-settings: "opsz" 72, "wght" 400',
		);
		expect(globalStylesSource).toContain(
			'font-variation-settings: "opsz" 16, "wght" 400',
		);
	});
});
