import Link from "next/link";
import { notFound } from "next/navigation";
import {
	getDocsEntryByHref,
	getDocsEntryBySlug,
	listDocsStaticParams,
} from "@/content/site-content";
import { createPublicMetadata } from "@/lib/site-metadata";
import { getDocsBreadcrumbJsonLd } from "@/lib/site-seo";

export const dynamicParams = false;

export function generateStaticParams() {
	return listDocsStaticParams();
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug?: string[] }>;
}) {
	const { slug } = await params;
	const entry = getDocsEntryBySlug(slug ?? []);

	if (!entry) {
		return createPublicMetadata({
			title: "Docs",
			description: "Plain answers for the essential Bardo flows.",
			path: "/docs",
		});
	}

	return createPublicMetadata({
		title: entry.title,
		description: entry.description,
		path: entry.href,
		type: "article",
	});
}

export default async function DocsEntryPage({
	params,
}: {
	params: Promise<{ slug?: string[] }>;
}) {
	const { slug } = await params;
	const entry = getDocsEntryBySlug(slug ?? []);

	if (!entry) {
		notFound();
	}

	const Content = (await entry.load()).default;
	const previousEntry = entry.previousHref
		? getDocsEntryByHref(entry.previousHref)
		: null;
	const nextEntry = entry.nextHref ? getDocsEntryByHref(entry.nextHref) : null;
	const breadcrumbJsonLd = JSON.stringify(getDocsBreadcrumbJsonLd(entry));

	return (
		<article className="flex min-w-0 flex-col gap-10">
			<script type="application/ld+json">{breadcrumbJsonLd}</script>
			<header className="flex flex-col gap-4 border-b border-border pb-8">
				<p className="ui-label text-muted-foreground">{entry.eyebrow}</p>
				<h1 className="font-reading-heading max-w-3xl text-4xl text-foreground sm:text-5xl">
					{entry.title}
				</h1>
				<p className="font-reading-body max-w-2xl text-muted-foreground">
					{entry.description}
				</p>
			</header>
			<div className="prose-reading docs-prose flex min-w-0 flex-col gap-6 text-foreground">
				<Content />
			</div>
			<nav
				aria-label="Docs page navigation"
				className="grid gap-3 border-t border-border pt-8 sm:grid-cols-2"
			>
				{previousEntry ? (
					<Link
						href={previousEntry.href}
						className="group flex h-full w-full min-w-0 flex-col gap-1 rounded-lg border border-border bg-background px-4 py-4 transition-colors hover:bg-muted"
					>
						<span className="ui-label text-muted-foreground">Previous</span>
						<span className="font-reading-body text-foreground">
							{previousEntry.title}
						</span>
					</Link>
				) : (
					<div className="hidden sm:block" />
				)}
				{nextEntry ? (
					<Link
						href={nextEntry.href}
						className="group flex h-full w-full min-w-0 flex-col gap-1 rounded-lg border border-border bg-background px-4 py-4 text-left transition-colors hover:bg-muted"
					>
						<span className="ui-label text-muted-foreground">Next</span>
						<span className="font-reading-body text-foreground">
							{nextEntry.title}
						</span>
					</Link>
				) : null}
			</nav>
		</article>
	);
}
