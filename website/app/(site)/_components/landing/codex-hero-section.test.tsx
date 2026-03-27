import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import CodexHeroSection from "./codex-hero-section";

describe("CodexHeroSection install surface", () => {
	test("renders a single curl install command", () => {
		const markup = renderToStaticMarkup(<CodexHeroSection />);

		expect(markup).toContain('aria-label="Install command"');
		expect(markup).toContain(">curl<");
		expect(markup).toContain("curl -fsSL https://bardo.gg/install | sh");
		expect(markup).not.toContain(">npm<");
		expect(markup).not.toContain(">bun<");
		expect(markup).not.toContain(">brew<");
		expect(markup).not.toContain(">paru<");
		expect(markup).not.toContain("bardo connect --client codex");
	});
});
