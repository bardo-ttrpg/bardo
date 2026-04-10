import type { ComponentType } from "react";

type MdxModule = { default: ComponentType<Record<string, unknown>> };

export type DocsSection = {
	id: string;
	title: string;
};

export type DocsGroupId = "get-started" | "product-model";

export type DocsGroup = {
	id: DocsGroupId;
	label: string;
	order: number;
};

export type DocsEntry = {
	slugSegments: readonly string[];
	href: string;
	title: string;
	description: string;
	navigationLabel: string;
	eyebrow: string;
	group: DocsGroupId;
	order: number;
	sections: readonly DocsSection[];
	previousHref: string | null;
	nextHref: string | null;
	lastModified: string;
	load(): Promise<MdxModule>;
};

export type BlogEntry = {
	slug: string;
	href: string;
	title: string;
	description: string;
	preview?: string;
	publishedAt: string;
	load(): Promise<MdxModule>;
};

const docsGroups = [
	{ id: "get-started", label: "Get Started", order: 1 },
	{ id: "product-model", label: "Product Model", order: 2 },
] as const satisfies readonly DocsGroup[];

const rawDocsEntries = [
	{
		slugSegments: [],
		href: "/docs",
		title: "Bardo Documentation",
		description:
			"Start with local install, .bardo prep, client connection, and the local-first runtime surface.",
		navigationLabel: "Overview",
		eyebrow: "Get Started",
		group: "get-started",
		order: 1,
		sections: [
			{ id: "what-bardo-covers", title: "What Bardo covers" },
			{ id: "recommended-path", title: "Recommended path" },
			{ id: "what-stays-outside-docs", title: "What stays outside docs" },
		],
		lastModified: "2026-04-04T00:00:00.000Z",
		load: () => import("@/content/docs/index.mdx"),
	},
	{
		slugSegments: ["install"],
		href: "/docs/install",
		title: "Install Bardo",
		description:
			"Install the local bridge and prepare the workspace for .bardo bootstrap.",
		navigationLabel: "Install",
		eyebrow: "Get Started",
		group: "get-started",
		order: 2,
		sections: [
			{ id: "macos-linux", title: "macOS and Linux" },
			{ id: "windows", title: "Windows" },
			{ id: "custom-install-paths", title: "Custom install paths" },
			{ id: "what-happens-next", title: "What happens next" },
		],
		lastModified: "2026-04-04T00:00:00.000Z",
		load: () => import("@/content/docs/install.mdx"),
	},
	{
		slugSegments: ["connect-client"],
		href: "/docs/connect-client",
		title: "Connect Client",
		description:
			"Point your MCP-capable client at the local bridge and understand the local-first prep artifacts.",
		navigationLabel: "Connect Client",
		eyebrow: "Get Started",
		group: "get-started",
		order: 3,
		sections: [
			{ id: "connection-flow", title: "Connection flow" },
			{ id: "what-you-approve", title: "What you approve" },
			{
				id: "what-stays-local",
				title: "What stays local",
			},
			{ id: "session-hygiene", title: "Session hygiene" },
		],
		lastModified: "2026-04-04T00:00:00.000Z",
		load: () => import("@/content/docs/connect-client.mdx"),
	},
	{
		slugSegments: ["clients", "opencode"],
		href: "/docs/clients/opencode",
		title: "OpenCode",
		description:
			"Install OpenCode, connect the local Bardo bridge, and keep OpenCode on its default model.",
		navigationLabel: "OpenCode",
		eyebrow: "Get Started",
		group: "get-started",
		order: 4,
		sections: [
			{ id: "install-opencode", title: "Install OpenCode" },
			{ id: "connect-bardo", title: "Connect Bardo" },
			{ id: "what-bardo-writes", title: "What Bardo writes" },
			{ id: "use-bardo-well-in-opencode", title: "Use Bardo well in OpenCode" },
		],
		lastModified: "2026-04-10T00:00:00.000Z",
		load: () => import("@/content/docs/clients/opencode.mdx"),
	},
	{
		slugSegments: ["clients", "claude-code-desktop"],
		href: "/docs/clients/claude-code-desktop",
		title: "Claude Code and Desktop App",
		description:
			"Use the Claude Code MCP path for Bardo, including when you prefer the Claude desktop app UI.",
		navigationLabel: "Claude Code",
		eyebrow: "Get Started",
		group: "get-started",
		order: 5,
		sections: [
			{ id: "install-claude", title: "Install Claude" },
			{ id: "connect-bardo", title: "Connect Bardo" },
			{ id: "what-bardo-writes", title: "What Bardo writes" },
			{ id: "use-bardo-well-in-claude", title: "Use Bardo well in Claude" },
		],
		lastModified: "2026-04-10T00:00:00.000Z",
		load: () => import("@/content/docs/clients/claude-code-desktop.mdx"),
	},
	{
		slugSegments: ["clients", "codex-cli-desktop"],
		href: "/docs/clients/codex-cli-desktop",
		title: "Codex CLI and Desktop App",
		description:
			"Connect Bardo through Codex’s workspace config and keep the same local workspace across CLI and app usage.",
		navigationLabel: "Codex",
		eyebrow: "Get Started",
		group: "get-started",
		order: 6,
		sections: [
			{ id: "install-codex", title: "Install Codex" },
			{ id: "connect-bardo", title: "Connect Bardo" },
			{ id: "what-bardo-writes", title: "What Bardo writes" },
			{
				id: "cli-and-desktop-app-guidance",
				title: "CLI and desktop app guidance",
			},
			{ id: "use-bardo-well-in-codex", title: "Use Bardo well in Codex" },
		],
		lastModified: "2026-04-10T00:00:00.000Z",
		load: () => import("@/content/docs/clients/codex-cli-desktop.mdx"),
	},
	{
		slugSegments: ["clients", "gemini-cli"],
		href: "/docs/clients/gemini-cli",
		title: "Gemini CLI",
		description:
			"Use the same one-command Bardo connect flow in Gemini CLI and let Bardo write the workspace MCP config for you.",
		navigationLabel: "Gemini CLI",
		eyebrow: "Get Started",
		group: "get-started",
		order: 7,
		sections: [
			{ id: "install-gemini-cli", title: "Install Gemini CLI" },
			{ id: "connect-bardo", title: "Connect Bardo" },
			{ id: "what-bardo-writes", title: "What Bardo writes" },
			{ id: "use-bardo-well-in-gemini", title: "Use Bardo well in Gemini" },
		],
		lastModified: "2026-04-10T00:00:00.000Z",
		load: () => import("@/content/docs/clients/gemini-cli.mdx"),
	},
	{
		slugSegments: ["clients", "cursor"],
		href: "/docs/clients/cursor",
		title: "Cursor",
		description:
			"Install Cursor, connect the local Bardo bridge, and keep campaign truth anchored in `.bardo/`.",
		navigationLabel: "Cursor",
		eyebrow: "Get Started",
		group: "get-started",
		order: 8,
		sections: [
			{ id: "install-cursor", title: "Install Cursor" },
			{ id: "connect-bardo", title: "Connect Bardo" },
			{ id: "what-bardo-writes", title: "What Bardo writes" },
			{ id: "use-bardo-well-in-cursor", title: "Use Bardo well in Cursor" },
		],
		lastModified: "2026-04-10T00:00:00.000Z",
		load: () => import("@/content/docs/clients/cursor.mdx"),
	},
	{
		slugSegments: ["rules-bootstrap"],
		href: "/docs/rules-bootstrap",
		title: "Rules Bootstrap",
		description:
			"Understand the strict rules bootstrap contract, preserved source copy, and normalized rules outputs.",
		navigationLabel: "Rules Bootstrap",
		eyebrow: "Get Started",
		group: "get-started",
		order: 9,
		sections: [
			{ id: "current-bootstrap-contract", title: "Current bootstrap contract" },
			{ id: "recommended-rulebook-input", title: "Recommended rulebook input" },
			{ id: "current-outputs", title: "Current outputs" },
			{ id: "what-normalization-keeps", title: "What normalization keeps" },
			{
				id: "simulation-depth-recommendation",
				title: "Simulation depth recommendation",
			},
		],
		lastModified: "2026-04-07T00:00:00.000Z",
		load: () => import("@/content/docs/rules-bootstrap.mdx"),
	},
	{
		slugSegments: ["campaign-truth"],
		href: "/docs/campaign-truth",
		title: "Campaign Truth",
		description:
			"Clarify workspace truth, the .bardo root, and the hosted service boundary.",
		navigationLabel: "Campaign Truth",
		eyebrow: "Product Model",
		group: "product-model",
		order: 1,
		sections: [
			{ id: "local-source-of-truth", title: "Local source of truth" },
			{ id: "remote-service-boundary", title: "Remote service boundary" },
			{
				id: "how-to-think-about-the-split",
				title: "How to think about the split",
			},
			{ id: "migration-note", title: "Migration note" },
		],
		lastModified: "2026-04-04T00:00:00.000Z",
		load: () => import("@/content/docs/campaign-truth.mdx"),
	},
	{
		slugSegments: ["mcp-surface"],
		href: "/docs/mcp-surface",
		title: "MCP Surface",
		description:
			"Understand the local runtime tools, prep artifacts, and conservative commit model.",
		navigationLabel: "MCP Surface",
		eyebrow: "Product Model",
		group: "product-model",
		order: 2,
		sections: [
			{ id: "tool-shape", title: "Tool shape" },
			{ id: "local-prep-first", title: "Local prep first" },
			{ id: "canon-and-commits", title: "Canon and commits" },
			{ id: "guardrails", title: "Guardrails" },
		],
		lastModified: "2026-04-04T00:00:00.000Z",
		load: () => import("@/content/docs/mcp-surface.mdx"),
	},
	{
		slugSegments: ["ruleset-mechanics"],
		href: "/docs/ruleset-mechanics",
		title: "Ruleset Mechanics",
		description:
			"See how normalized rules output guides simulation depth and conservative adjudication.",
		navigationLabel: "Ruleset Mechanics",
		eyebrow: "Product Model",
		group: "product-model",
		order: 3,
		sections: [
			{
				id: "workspace-defined-rules-context",
				title: "Workspace-defined rules context",
			},
			{ id: "support-tiers", title: "Support tiers" },
			{ id: "conservative-adjudication", title: "Conservative adjudication" },
			{ id: "table-authority", title: "Table authority" },
		],
		lastModified: "2026-04-04T00:00:00.000Z",
		load: () => import("@/content/docs/ruleset-mechanics.mdx"),
	},
	{
		slugSegments: ["runtime-skills"],
		href: "/docs/runtime-skills",
		title: "Runtime Skills",
		description:
			"Learn the behavioral guidance that keeps clients evidence-first and local-first.",
		navigationLabel: "Runtime Skills",
		eyebrow: "Product Model",
		group: "product-model",
		order: 4,
		sections: [
			{ id: "built-in-guidance", title: "Built-in guidance" },
			{ id: "client-behavior", title: "Client behavior" },
			{ id: "precedence", title: "Precedence" },
			{
				id: "how-to-think-about-runtime-skills",
				title: "How to think about runtime skills",
			},
		],
		lastModified: "2026-04-04T00:00:00.000Z",
		load: () => import("@/content/docs/runtime-skills.mdx"),
	},
] as const satisfies readonly Omit<DocsEntry, "previousHref" | "nextHref">[];

const docsEntries = rawDocsEntries
	.toSorted((left, right) => {
		const leftGroup =
			docsGroups.find((group) => group.id === left.group)?.order ??
			Number.MAX_SAFE_INTEGER;
		const rightGroup =
			docsGroups.find((group) => group.id === right.group)?.order ??
			Number.MAX_SAFE_INTEGER;

		if (leftGroup !== rightGroup) {
			return leftGroup - rightGroup;
		}

		return left.order - right.order;
	})
	.map((entry, index, entries) => ({
		...entry,
		previousHref: entries[index - 1]?.href ?? null,
		nextHref: entries[index + 1]?.href ?? null,
	})) as readonly DocsEntry[];

const blogEntries: readonly BlogEntry[] = [];

function slugKey(segments: readonly string[]) {
	return segments.join("/");
}

export function listDocsEntries() {
	return docsEntries;
}

export function listDocsGroups() {
	return docsGroups;
}

export function getDocsEntryBySlug(slugSegments: readonly string[] = []) {
	const key = slugKey(slugSegments);
	return (
		docsEntries.find((entry) => slugKey(entry.slugSegments) === key) ?? null
	);
}

export function getDocsEntryByHref(href: string) {
	return docsEntries.find((entry) => entry.href === href) ?? null;
}

export function listDocsGroupsWithEntries() {
	return docsGroups.map((group) => ({
		...group,
		entries: docsEntries.filter((entry) => entry.group === group.id),
	}));
}

export function listDocsStaticParams() {
	return docsEntries.map((entry) => ({
		slug: [...entry.slugSegments],
	}));
}

export type DocsSearchEntry = {
	title: string;
	href: string;
	groupId: DocsGroupId;
	groupLabel: string;
	kind: "page" | "section";
	description: string;
	matchLabel: string;
};

export function listDocsSearchEntries(): readonly DocsSearchEntry[] {
	return docsEntries.flatMap((entry) => {
		const groupLabel =
			docsGroups.find((group) => group.id === entry.group)?.label ??
			entry.group;
		const pageEntry: DocsSearchEntry = {
			title: entry.title,
			href: entry.href,
			groupId: entry.group,
			groupLabel,
			kind: "page",
			description: entry.description,
			matchLabel: entry.navigationLabel,
		};

		const sectionEntries = entry.sections.map((section) => ({
			title: section.title,
			href: `${entry.href}#${section.id}`,
			groupId: entry.group,
			groupLabel,
			kind: "section" as const,
			description: entry.title,
			matchLabel: section.title,
		}));

		return [pageEntry, ...sectionEntries];
	});
}

export function searchDocsEntries(query: string) {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) {
		return [];
	}

	return listDocsSearchEntries().filter((entry) =>
		[
			entry.title,
			entry.description,
			entry.groupLabel,
			entry.matchLabel,
			entry.href,
		]
			.join(" ")
			.toLowerCase()
			.includes(normalizedQuery),
	);
}

export function listBlogEntries() {
	return blogEntries;
}

export function getLatestBlogEntry() {
	return blogEntries[0] ?? null;
}

export function getBlogEntryBySlug(slug: string) {
	return blogEntries.find((entry) => entry.slug === slug) ?? null;
}

export function listBlogStaticParams() {
	return blogEntries.map((entry) => ({ slug: entry.slug }));
}
