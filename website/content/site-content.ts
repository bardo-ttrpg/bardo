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
			"Start with the local install, client connection flow, and core product model.",
		navigationLabel: "Overview",
		eyebrow: "Get Started",
		group: "get-started",
		order: 1,
		sections: [
			{ id: "what-bardo-covers", title: "What Bardo covers" },
			{ id: "recommended-path", title: "Recommended path" },
			{ id: "what-stays-outside-docs", title: "What stays outside docs" },
		],
		lastModified: "2026-03-29T00:00:00.000Z",
		load: () => import("@/content/docs/index.mdx"),
	},
	{
		slugSegments: ["install"],
		href: "/docs/install",
		title: "Install",
		description: "Install the local bridge with the published shell scripts.",
		navigationLabel: "Install",
		eyebrow: "Get Started",
		group: "get-started",
		order: 2,
		sections: [
			{ id: "macos-linux", title: "macOS and Linux" },
			{ id: "windows", title: "Windows" },
			{ id: "what-happens-next", title: "What happens next" },
		],
		lastModified: "2026-03-29T00:00:00.000Z",
		load: () => import("@/content/docs/install.mdx"),
	},
	{
		slugSegments: ["connect-client"],
		href: "/docs/connect-client",
		title: "Connect Client",
		description: "Point your MCP-capable client at the local Bardo bridge.",
		navigationLabel: "Connect Client",
		eyebrow: "Get Started",
		group: "get-started",
		order: 3,
		sections: [
			{ id: "connection-flow", title: "Connection flow" },
			{ id: "what-you-approve", title: "What you approve" },
			{
				id: "what-the-client-keeps-local",
				title: "What the client keeps local",
			},
		],
		lastModified: "2026-03-29T00:00:00.000Z",
		load: () => import("@/content/docs/connect-client.mdx"),
	},
	{
		slugSegments: ["campaign-truth"],
		href: "/docs/campaign-truth",
		title: "Campaign Truth",
		description: "Clarify what stays local and what Bardo handles remotely.",
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
		],
		lastModified: "2026-03-29T00:00:00.000Z",
		load: () => import("@/content/docs/campaign-truth.mdx"),
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
