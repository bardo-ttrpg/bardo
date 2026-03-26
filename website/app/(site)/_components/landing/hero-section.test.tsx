import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import HeroSection from "./hero-section";

describe("HeroSection", () => {
	test("surfaces the current MCP tool count instead of the old continuity report stat", () => {
		const markup = renderToStaticMarkup(
			<HeroSection wordmarkClassName="font-sans" />,
		);

		expect(markup).toContain(">6<");
		expect(markup).toContain("Premium V1 tools");
		expect(markup).not.toContain("Continuity reports");
	});
});
