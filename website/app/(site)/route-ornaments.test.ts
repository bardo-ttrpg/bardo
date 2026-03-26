import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const routeFiles = [
	"./pricing/page.tsx",
	"./pricing/pricing-toggle.tsx",
	"./_components/landing/comparison-section.tsx",
	"./_components/landing/compatibility-section.tsx",
	"./_components/landing/cta-section.tsx",
	"./_components/landing/workspace-section.tsx",
] as const;

describe("route ornament cleanup", () => {
	test("removes decorative corner marker spans from website routes", () => {
		for (const routeFile of routeFiles) {
			const source = readFileSync(new URL(routeFile, import.meta.url), "utf8");

			expect(source).not.toContain("CrosshairMarker");
		}
	});
});
