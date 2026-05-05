export type DocsEntry = {
	title: string;
	href: string;
	source: string;
	group: "Get Started" | "Product Model";
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
];
