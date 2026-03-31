import type { ComponentType } from "react";

type MdxModule = { default: ComponentType<Record<string, unknown>> };

type DocsEntry = {
	slugSegments: readonly string[];
	href: string;
	title: string;
	description: string;
	navigationLabel: string;
	eyebrow: string;
	lastModified: string;
	load(): Promise<MdxModule>;
};

type BlogEntry = {
	slug: string;
	href: string;
	title: string;
	description: string;
	preview: string;
	publishedAt: string;
	load(): Promise<MdxModule>;
};

const docsEntries = [
	{
		slugSegments: [],
		href: "/docs",
		title: "Docs",
		description: "Plain answers for the essential Bardo flows.",
		navigationLabel: "Overview",
		eyebrow: "Docs",
		lastModified: "2026-03-29T00:00:00.000Z",
		load: () => import("@/content/docs/index.mdx"),
	},
	{
		slugSegments: ["install"],
		href: "/docs/install",
		title: "Install",
		description: "Install the local bridge with the published shell scripts.",
		navigationLabel: "Install",
		eyebrow: "Docs / Install",
		lastModified: "2026-03-29T00:00:00.000Z",
		load: () => import("@/content/docs/install.mdx"),
	},
	{
		slugSegments: ["connect-client"],
		href: "/docs/connect-client",
		title: "Connect a client",
		description: "Point your MCP-capable client at the local Bardo bridge.",
		navigationLabel: "Connect a client",
		eyebrow: "Docs / Connect",
		lastModified: "2026-03-29T00:00:00.000Z",
		load: () => import("@/content/docs/connect-client.mdx"),
	},
	{
		slugSegments: ["campaign-truth"],
		href: "/docs/campaign-truth",
		title: "Campaign truth",
		description: "Clarify what stays local and what Bardo handles remotely.",
		navigationLabel: "Campaign truth",
		eyebrow: "Docs / Campaign Truth",
		lastModified: "2026-03-29T00:00:00.000Z",
		load: () => import("@/content/docs/campaign-truth.mdx"),
	},
	{
		slugSegments: ["credits-and-billing"],
		href: "/docs/credits-and-billing",
		title: "Credits and billing",
		description:
			"How credits, subscriptions, and usage limits appear in Bardo.",
		navigationLabel: "Credits and billing",
		eyebrow: "Docs / Billing",
		lastModified: "2026-03-29T00:00:00.000Z",
		load: () => import("@/content/docs/credits-and-billing.mdx"),
	},
] as const satisfies readonly DocsEntry[];

const blogEntries: readonly BlogEntry[] = [];

function slugKey(segments: readonly string[]) {
	return segments.join("/");
}

export function listDocsEntries() {
	return docsEntries;
}

export function getDocsEntryBySlug(slugSegments: readonly string[] = []) {
	const key = slugKey(slugSegments);
	return (
		docsEntries.find((entry) => slugKey(entry.slugSegments) === key) ?? null
	);
}

export function listDocsStaticParams() {
	return docsEntries.map((entry) => ({
		slug: [...entry.slugSegments],
	}));
}

export function listBlogEntries() {
	return blogEntries;
}

export function getBlogEntryBySlug(slug: string) {
	return blogEntries.find((entry) => entry.slug === slug) ?? null;
}

export function listBlogStaticParams() {
	return blogEntries.map((entry) => ({ slug: entry.slug }));
}
