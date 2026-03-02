import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const rootLayoutSource = readFileSync(
	new URL("./layout.tsx", import.meta.url),
	"utf8",
);
const siteLayoutSource = readFileSync(
	new URL("./(site)/layout.tsx", import.meta.url),
	"utf8",
);

describe("Clerk provider placement", () => {
	test("wraps the app at the root layout", () => {
		expect(rootLayoutSource).toContain("OptionalClerkProvider");
		expect(rootLayoutSource).toContain("isClerkAuthConfigured");
	});

	test("does not scope Clerk only to the site route group", () => {
		expect(siteLayoutSource).not.toContain("OptionalClerkProvider");
	});

	test("wires Vercel analytics at the root layout", () => {
		expect(rootLayoutSource).toContain("@vercel/analytics/next");
		expect(rootLayoutSource).toContain("@vercel/speed-insights/next");
		expect(rootLayoutSource).toContain("<Analytics");
		expect(rootLayoutSource).toContain("<SpeedInsights");
	});
});
