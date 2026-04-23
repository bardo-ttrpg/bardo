import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	listDocsEntries,
	listDocsGroupsWithEntries,
	listDocsStaticParams,
	searchDocsEntries,
} from "../../../content/site-content";

const docsRouteSource = readFileSync(
	new URL("./[[...slug]]/page.tsx", import.meta.url),
	"utf8",
);
const docsLayoutSource = readFileSync(
	new URL("./layout.tsx", import.meta.url),
	"utf8",
);
const docsShellSource = readFileSync(
	new URL("./_components/docs-shell.tsx", import.meta.url),
	"utf8",
);
const installDocSource = readFileSync(
	new URL("../../../content/docs/install.mdx", import.meta.url),
	"utf8",
);
const connectDocSource = readFileSync(
	new URL("../../../content/docs/connect-client.mdx", import.meta.url),
	"utf8",
);
const opencodeDocSource = readFileSync(
	new URL("../../../content/docs/clients/opencode.mdx", import.meta.url),
	"utf8",
);
const geminiDocSource = readFileSync(
	new URL("../../../content/docs/clients/gemini-cli.mdx", import.meta.url),
	"utf8",
);
const mechanicsDocSource = readFileSync(
	new URL("../../../content/docs/ruleset-mechanics.mdx", import.meta.url),
	"utf8",
);
const mcpSurfaceDocSource = readFileSync(
	new URL("../../../content/docs/mcp-surface.mdx", import.meta.url),
	"utf8",
);
const rulesBootstrapDocSource = readFileSync(
	new URL("../../../content/docs/rules-bootstrap.mdx", import.meta.url),
	"utf8",
);
const runtimeSkillsDocSource = readFileSync(
	new URL("../../../content/docs/runtime-skills.mdx", import.meta.url),
	"utf8",
);

describe("docs content", () => {
	test("drives docs from a local manifest and static params", () => {
		expect(listDocsEntries().map((entry) => entry.href)).toEqual([
			"/docs",
			"/docs/install",
			"/docs/connect-client",
			"/docs/clients/opencode",
			"/docs/clients/claude-code-desktop",
			"/docs/clients/codex-cli-desktop",
			"/docs/clients/gemini-cli",
			"/docs/clients/cursor",
			"/docs/rules-bootstrap",
			"/docs/campaign-truth",
			"/docs/mcp-surface",
			"/docs/ruleset-mechanics",
			"/docs/runtime-skills",
		]);
		expect(listDocsStaticParams()).toEqual([
			{ slug: [] },
			{ slug: ["install"] },
			{ slug: ["connect-client"] },
			{ slug: ["clients", "opencode"] },
			{ slug: ["clients", "claude-code-desktop"] },
			{ slug: ["clients", "codex-cli-desktop"] },
			{ slug: ["clients", "gemini-cli"] },
			{ slug: ["clients", "cursor"] },
			{ slug: ["rules-bootstrap"] },
			{ slug: ["campaign-truth"] },
			{ slug: ["mcp-surface"] },
			{ slug: ["ruleset-mechanics"] },
			{ slug: ["runtime-skills"] },
		]);
	});

	test("keeps grouped navigation, section metadata, and pager order in one manifest", () => {
		expect(
			listDocsGroupsWithEntries().map((group) => ({
				label: group.label,
				hrefs: group.entries.map((entry) => entry.href),
			})),
		).toEqual([
			{
				label: "Get Started",
				hrefs: [
					"/docs",
					"/docs/install",
					"/docs/connect-client",
					"/docs/clients/opencode",
					"/docs/clients/claude-code-desktop",
					"/docs/clients/codex-cli-desktop",
					"/docs/clients/gemini-cli",
					"/docs/clients/cursor",
					"/docs/rules-bootstrap",
				],
			},
			{
				label: "Product Model",
				hrefs: [
					"/docs/campaign-truth",
					"/docs/mcp-surface",
					"/docs/ruleset-mechanics",
					"/docs/runtime-skills",
				],
			},
		]);

		expect(
			listDocsEntries().map((entry) => ({
				href: entry.href,
				previousHref: entry.previousHref,
				nextHref: entry.nextHref,
				sectionCount: entry.sections.length,
			})),
		).toEqual([
			{
				href: "/docs",
				previousHref: null,
				nextHref: "/docs/install",
				sectionCount: 3,
			},
			{
				href: "/docs/install",
				previousHref: "/docs",
				nextHref: "/docs/connect-client",
				sectionCount: 4,
			},
			{
				href: "/docs/connect-client",
				previousHref: "/docs/install",
				nextHref: "/docs/clients/opencode",
				sectionCount: 4,
			},
			{
				href: "/docs/clients/opencode",
				previousHref: "/docs/connect-client",
				nextHref: "/docs/clients/claude-code-desktop",
				sectionCount: 4,
			},
			{
				href: "/docs/clients/claude-code-desktop",
				previousHref: "/docs/clients/opencode",
				nextHref: "/docs/clients/codex-cli-desktop",
				sectionCount: 4,
			},
			{
				href: "/docs/clients/codex-cli-desktop",
				previousHref: "/docs/clients/claude-code-desktop",
				nextHref: "/docs/clients/gemini-cli",
				sectionCount: 5,
			},
			{
				href: "/docs/clients/gemini-cli",
				previousHref: "/docs/clients/codex-cli-desktop",
				nextHref: "/docs/clients/cursor",
				sectionCount: 4,
			},
			{
				href: "/docs/clients/cursor",
				previousHref: "/docs/clients/gemini-cli",
				nextHref: "/docs/rules-bootstrap",
				sectionCount: 4,
			},
			{
				href: "/docs/rules-bootstrap",
				previousHref: "/docs/clients/cursor",
				nextHref: "/docs/campaign-truth",
				sectionCount: 5,
			},
			{
				href: "/docs/campaign-truth",
				previousHref: "/docs/rules-bootstrap",
				nextHref: "/docs/mcp-surface",
				sectionCount: 4,
			},
			{
				href: "/docs/mcp-surface",
				previousHref: "/docs/campaign-truth",
				nextHref: "/docs/ruleset-mechanics",
				sectionCount: 4,
			},
			{
				href: "/docs/ruleset-mechanics",
				previousHref: "/docs/mcp-surface",
				nextHref: "/docs/runtime-skills",
				sectionCount: 4,
			},
			{
				href: "/docs/runtime-skills",
				previousHref: "/docs/ruleset-mechanics",
				nextHref: null,
				sectionCount: 4,
			},
		]);
	});

	test("builds lightweight local docs search data from the same source of truth", () => {
		expect(searchDocsEntries("linux").map((entry) => entry.href)).toContain(
			"/docs/install#macos-linux",
		);
		expect(
			searchDocsEntries("remote service boundary").some(
				(entry) =>
					entry.href === "/docs/campaign-truth#remote-service-boundary",
			),
		).toBe(true);
		expect(
			searchDocsEntries("table authority").some(
				(entry) => entry.href === "/docs/ruleset-mechanics#table-authority",
			),
		).toBe(true);
	});

	test("uses a single catch-all route with static params instead of per-page docs files", () => {
		expect(docsRouteSource).toContain("export const dynamicParams = false");
		expect(docsRouteSource).toContain("generateStaticParams");
		expect(docsRouteSource).toContain("getDocsEntryBySlug");
		expect(docsRouteSource).not.toContain("redirect(");
	});

	test("renders docs inside the dedicated docs layout shell", () => {
		expect(docsLayoutSource).toContain("DocsShell");
		expect(docsLayoutSource).toContain("listDocsGroupsWithEntries");
		expect(docsLayoutSource).toContain("listDocsSearchEntries");
		expect(docsShellSource).toContain("Search docs");
		expect(docsShellSource).toContain("On this page");
		expect(docsShellSource).toContain("const activeEntry = useMemo");
		expect(docsShellSource).toContain("isActive={pathname === entry.href}");
		expect(docsShellSource).toContain('aria-label="On this page"');
	});

	test("keeps the install page as a simple text-first document", () => {
		expect(installDocSource).not.toContain("InstallCommandSurface");
		expect(installDocSource).toContain(
			"curl -fsSL https://bardo.gg/install | sh",
		);
		expect(installDocSource).toContain(
			"irm https://bardo.gg/install.ps1 | iex",
		);
		expect(installDocSource).toContain("release binary");
		expect(installDocSource).toContain("checksum");
		expect(installDocSource).toContain("local bridge");
		expect(installDocSource).toContain("browser approval");
		expect(installDocSource).toContain("hosted side only handles");
	});

	test("documents client-specific Bardo setup for current supported clients", () => {
		expect(opencodeDocSource).toContain(
			"does not set OpenCode's `model` field",
		);
		expect(opencodeDocSource).toContain("opencode.json");
		expect(opencodeDocSource).toContain("bardo connect --client opencode");
		expect(geminiDocSource).toContain("bardo connect --client gemini");
		expect(geminiDocSource).toContain(".gemini/settings.json");
		expect(geminiDocSource).toContain("trust the workspace");
		expect(geminiDocSource).toContain("Restart Gemini CLI");
		expect(geminiDocSource).toContain("missing campaign material");
	});

	test("documents the rulebook bootstrap pipeline and generated outputs", () => {
		expect(rulesBootstrapDocSource).toContain("rulebook.md");
		expect(rulesBootstrapDocSource).toContain(".bardo/rules/rulebook.md");
		expect(rulesBootstrapDocSource).toContain("rules/normalized");
		expect(rulesBootstrapDocSource).toContain("simulation depth");
	});

	test("documents conservative rules adjudication in plain MDX", () => {
		expect(mechanicsDocSource).toContain("simulation-depth recommendation");
		expect(mechanicsDocSource).toContain("conservative adjudication");
		expect(mechanicsDocSource).toContain("table decide");
	});

	test("documents the explicit correction flow and latest canon precedence", () => {
		expect(mcpSurfaceDocSource).toContain("user_correction");
		expect(mcpSurfaceDocSource).toContain(
			"validated local state-changing events",
		);
		expect(runtimeSkillsDocSource).toContain("explicit user correction");
		expect(runtimeSkillsDocSource).toContain("safe partial answer");
		expect(connectDocSource).toContain("local MCP endpoint");
		expect(connectDocSource).toContain("what stays local");
		expect(connectDocSource).toContain("why this is needed");
	});
});
