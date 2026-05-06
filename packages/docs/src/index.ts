export type DocsEntry = {
	title: string;
	href: string;
	source: string;
	group: "Get Started" | "Clients" | "Product Model";
};

export const docsEntries: DocsEntry[] = [
	{
		title: "Overview",
		href: "/docs",
		source: "content/docs/index.mdx",
		group: "Get Started",
	},
	{
		title: "Install",
		href: "/docs/install",
		source: "content/docs/install.mdx",
		group: "Get Started",
	},
	{
		title: "Connect a Client",
		href: "/docs/connect-client",
		source: "content/docs/connect-client.mdx",
		group: "Get Started",
	},
	{
		title: "OpenCode",
		href: "/docs/clients/opencode",
		source: "content/docs/clients/opencode.mdx",
		group: "Clients",
	},
	{
		title: "Claude Code And Desktop App",
		href: "/docs/clients/claude-code-desktop",
		source: "content/docs/clients/claude-code-desktop.mdx",
		group: "Clients",
	},
	{
		title: "Codex CLI And Desktop App",
		href: "/docs/clients/codex-cli-desktop",
		source: "content/docs/clients/codex-cli-desktop.mdx",
		group: "Clients",
	},
	{
		title: "Gemini CLI",
		href: "/docs/clients/gemini-cli",
		source: "content/docs/clients/gemini-cli.mdx",
		group: "Clients",
	},
	{
		title: "Cursor",
		href: "/docs/clients/cursor",
		source: "content/docs/clients/cursor.mdx",
		group: "Clients",
	},
	{
		title: "Rules Bootstrap",
		href: "/docs/rules-bootstrap",
		source: "content/docs/rules-bootstrap.mdx",
		group: "Product Model",
	},
	{
		title: "Campaign Truth",
		href: "/docs/campaign-truth",
		source: "content/docs/campaign-truth.mdx",
		group: "Product Model",
	},
	{
		title: "MCP Surface",
		href: "/docs/mcp-surface",
		source: "content/docs/mcp-surface.mdx",
		group: "Product Model",
	},
	{
		title: "Runtime Skills",
		href: "/docs/runtime-skills",
		source: "content/docs/runtime-skills.mdx",
		group: "Product Model",
	},
	{
		title: "Ruleset Mechanics",
		href: "/docs/ruleset-mechanics",
		source: "content/docs/ruleset-mechanics.mdx",
		group: "Product Model",
	},
];
