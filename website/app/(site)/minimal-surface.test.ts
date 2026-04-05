import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const homeSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const buttonSource = readFileSync(
	new URL("../../components/ui/button.tsx", import.meta.url),
	"utf8",
);
const notFoundSource = readFileSync(
	new URL("../not-found.tsx", import.meta.url),
	"utf8",
);
const explicit404Source = readFileSync(
	new URL("./404/page.tsx", import.meta.url),
	"utf8",
);

describe("minimal public surface", () => {
	test("ships a text-first homepage instead of the old Framer template", () => {
		expect(homeSource).toContain('href="/docs/install"');
		expect(homeSource).toContain("landingFooterLinks.map");
		expect(homeSource).toContain("landing-footer-link");
		expect(homeSource).toContain("Button");
		expect(homeSource).toContain("Start Playing");
		expect(homeSource).not.toContain("FramerTemplatePage");
	});

	test("uses the shadcn button component for the primary home action", () => {
		expect(homeSource).toContain("Button");
		expect(buttonSource).toContain('data-slot="button"');
	});

	test("keeps the public surface intentionally small", () => {
		expect(existsSync(new URL("./contact/page.tsx", import.meta.url))).toBe(
			false,
		);
		expect(existsSync(new URL("./pricing/page.tsx", import.meta.url))).toBe(
			false,
		);
		expect(
			existsSync(new URL("./(public-secondary)/pricing/page.tsx", import.meta.url)),
		).toBe(true);
		expect(
			existsSync(new URL("./privacy-policy/page.tsx", import.meta.url)),
		).toBe(false);
	});

	test("limits the footer link click target to the text while preserving centered flex items", () => {
		expect(homeSource).toContain('className="list-none grow text-center"');
		expect(homeSource).toContain('className="landing-footer-link inline"');
	});

	test("shares one minimal 404 experience", () => {
		expect(notFoundSource).toContain("Minimal404Page");
		expect(explicit404Source).toContain("Minimal404Page");
		expect(notFoundSource).not.toContain("FramerTemplatePage");
		expect(explicit404Source).not.toContain("FramerTemplatePage");
	});
});
