import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const docsIndexSource = readFileSync(
	new URL("./page.tsx", import.meta.url),
	"utf8",
);
const installDocsSource = readFileSync(
	new URL("./install/page.tsx", import.meta.url),
	"utf8",
);
const connectClientDocsSource = readFileSync(
	new URL("./connect-client/page.tsx", import.meta.url),
	"utf8",
);
const campaignTruthDocsSource = readFileSync(
	new URL("./campaign-truth/page.tsx", import.meta.url),
	"utf8",
);
const creditsDocsSource = readFileSync(
	new URL("./credits-and-billing/page.tsx", import.meta.url),
	"utf8",
);
const landingDataSource = readFileSync(
	new URL("../_components/landing/data.ts", import.meta.url),
	"utf8",
);
const pricingPageSource = readFileSync(
	new URL("../pricing/page.tsx", import.meta.url),
	"utf8",
);

describe("website docs and product copy", () => {
	test("keeps the lightweight docs surface focused on install, connection, truth, and billing", () => {
		expect(docsIndexSource).toContain('href: "/docs/install"');
		expect(docsIndexSource).toContain('href: "/docs/connect-client"');
		expect(docsIndexSource).toContain('href: "/docs/campaign-truth"');
		expect(docsIndexSource).toContain('href: "/docs/credits-and-billing"');
	});

	test("explains the local workspace boundary and canonical workspace files", () => {
		expect(installDocsSource).toContain("local bridge");
		expect(installDocsSource).toContain(
			"does not store your campaign in the cloud",
		);
		expect(connectClientDocsSource).toContain("projections/current-state.md");
		expect(connectClientDocsSource).toContain("logs/world-state-overview.md");
		expect(connectClientDocsSource).toContain("logs/timeline-diff.md");
		expect(connectClientDocsSource).toContain("timeline_diff");
		expect(connectClientDocsSource).toContain("browser");
		expect(campaignTruthDocsSource).toContain("events/canonical.ndjson");
		expect(campaignTruthDocsSource).toContain("Canon");
		expect(campaignTruthDocsSource).toContain("Inference");
		expect(campaignTruthDocsSource).toContain("Suggestion");
		expect(campaignTruthDocsSource).toContain("logs/timeline-diff.md");
		expect(installDocsSource).not.toContain("premium call path");
		expect(connectClientDocsSource).not.toContain("resource://reports");
	});

	test("keeps the flat credit model visible in docs and pricing copy", () => {
		expect(creditsDocsSource).toContain("1 accepted MCP tool call = 1 credit");
		expect(pricingPageSource).toContain(
			"One accepted Bardo MCP tool call consumes one credit.",
		);
	});

	test("matches the public landing workspace example to the real nested bardo layout", () => {
		expect(landingDataSource).toContain("./the-iron-duchy/bardo/");
		expect(landingDataSource).toContain('id: "projections"');
		expect(landingDataSource).toContain('name: "current-state.md"');
		expect(landingDataSource).toContain('name: "canonical.ndjson"');
		expect(landingDataSource).toContain('id: "logs"');
		expect(landingDataSource).toContain('name: "world-state-overview.md"');
		expect(landingDataSource).toContain('id: "docs"');
		expect(landingDataSource).toContain('name: "quickstart.md"');
		expect(landingDataSource).toContain('tool: "timeline_diff"');
	});
});
