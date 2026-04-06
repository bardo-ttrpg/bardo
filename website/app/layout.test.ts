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
const siteLayoutSource = readFileSync(siteLayoutPath, "utf8");
const authLayoutSource = readFileSync(
	new URL("./(site)/(auth)/layout.tsx", import.meta.url),
	"utf8",
);
const dashboardLayoutSource = readFileSync(
	new URL("./(site)/dashboard/layout.tsx", import.meta.url),
	"utf8",
);

describe("Clerk provider placement", () => {
	test("keeps the root layout free of Clerk and scopes the provider to auth-aware surfaces", () => {
		expect(rootLayoutSource).not.toContain("OptionalClerkProvider");
		expect(rootLayoutSource).not.toContain("isClerkAuthConfigured");
		expect(authLayoutSource).toContain("OptionalClerkProvider");
		expect(dashboardLayoutSource).toContain("OptionalClerkProvider");
	});

	test("uses a site layout to preserve shared chrome across route navigation", () => {
		expect(existsSync(siteLayoutPath)).toBe(true);
		expect(siteLayoutSource).toContain("SiteLayoutChrome");
		expect(siteLayoutSource).not.toContain("OptionalClerkProvider");
	});

	test("prepares analytics and speed insights for Vercel deployments", () => {
		expect(rootLayoutSource).toContain("@vercel/analytics/next");
		expect(rootLayoutSource).toContain("@vercel/speed-insights/next");
		expect(rootLayoutSource).toContain("SHOW_ANALYTICS");
		expect(rootLayoutSource).toContain("<Analytics");
		expect(rootLayoutSource).toContain("SHOW_SPEED_INSIGHTS");
		expect(rootLayoutSource).toContain("<SpeedInsights");
	});

	test("defines canonical, social, and robots metadata at the root layout", () => {
		expect(rootLayoutSource).toContain("metadataBase");
		expect(rootLayoutSource).toContain("manifest");
		expect(rootLayoutSource).toContain("icons");
		expect(rootLayoutSource).toContain("openGraph");
		expect(rootLayoutSource).toContain("twitter");
		expect(rootLayoutSource).toContain("robots");
		expect(rootLayoutSource).toContain("alternates");
	});

	test("keeps the root layout visually stripped down", () => {
		expect(rootLayoutSource).not.toContain('backgroundColor: "#080a09"');
		expect(rootLayoutSource).toContain('colorScheme: "dark light"');
		expect(rootLayoutSource).toContain('themeColor: "#171717"');
		expect(rootLayoutSource).toContain("siteHeading.variable");
		expect(rootLayoutSource).toContain("siteUi.variable");
	});

	test("wraps the app in a next-themes provider with dark mode as the default", () => {
		expect(rootLayoutSource).toContain('from "@/components/theme-provider"');
		expect(rootLayoutSource).toContain("<ThemeProvider");
		expect(rootLayoutSource).toContain('attribute="class"');
		expect(rootLayoutSource).toContain('defaultTheme="dark"');
		expect(rootLayoutSource).toContain("enableSystem={false}");
	});

	test("uses Space Grotesk plus Inter at the root", () => {
		expect(siteFontsSource).toContain("Space_Grotesk");
		expect(siteFontsSource).toContain("Inter");
		expect(siteFontsSource).toContain('from "next/font/google"');
		expect(siteFontsSource).not.toContain("Geist");
		expect(siteFontsSource).not.toContain("Cardo");
		expect(siteFontsSource).not.toContain("Literata");
		expect(siteFontsSource).not.toContain("Newsreader");
	});

	test("defines shadcn tokens plus heading and body font variables globally", () => {
		expect(globalStylesSource).toContain("--font-reading");
		expect(globalStylesSource).toContain("--font-ui");
		expect(globalStylesSource).toContain("--font-code");
		expect(globalStylesSource).toContain("--motion-duration-base");
		expect(globalStylesSource).toContain(".landing-footer-link");
		expect(globalStylesSource).toContain(
			"@media (prefers-reduced-motion: reduce)",
		);
		expect(globalStylesSource).toContain('@import "shadcn/tailwind.css"');
		expect(globalStylesSource).toContain(
			"--font-heading: var(--font-space-grotesk)",
		);
		expect(globalStylesSource).toContain("--font-sans: var(--font-inter)");
		expect(globalStylesSource).toContain("prefers-reduced-motion: no-preference");
	});
});
