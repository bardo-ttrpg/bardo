import type { ReactNode } from "react";
import { TransitionLink } from "@/components/transition-link";
import { BardoViewTransition } from "@/components/view-transition";
import type { BlogEntry } from "@/content/site-content";
import { BlogSidebarNav } from "./blog-sidebar-nav";

type BlogSidebarEntry = {
	href: string;
	title: string;
};

export function BlogLayoutShell({
	entries,
	children,
}: {
	entries: readonly BlogSidebarEntry[];
	children: ReactNode;
}) {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pb-10 pt-8 sm:px-8 sm:pb-12 sm:pt-8 lg:pb-16 lg:pt-10">
			<section className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-14">
				<aside className="bardo-persistent-surface lg:sticky lg:top-10 lg:self-start">
					<BlogSidebarNav entries={entries} />
				</aside>
				<BardoViewTransition name="bardo-page-region">
					<section className="bardo-page-region min-w-0">{children}</section>
				</BardoViewTransition>
			</section>
		</main>
	);
}

export function BlogEntryContent({
	entry,
	children,
}: {
	entry: BlogEntry;
	children: ReactNode;
}) {
	return (
		<section className="min-w-0">
			<header className="flex max-w-3xl flex-col gap-5 border-b border-border pb-8">
				<div className="flex flex-col gap-3">
					<h1 className="font-reading-heading text-4xl text-foreground sm:text-5xl">
						{entry.title}
					</h1>
					<p className="font-reading-body max-w-2xl text-lg text-muted-foreground">
						{entry.preview ?? entry.description}
					</p>
				</div>
				<dl className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
					<div className="flex flex-col gap-1">
						<dt className="ui-label text-muted-foreground">Published</dt>
						<dd className="font-reading-body text-foreground">
							{entry.publishedAt}
						</dd>
					</div>
					<div className="flex flex-col gap-1">
						<dt className="ui-label text-muted-foreground">Collection</dt>
						<dd className="font-reading-body text-foreground">Blog</dd>
					</div>
				</dl>
			</header>
			<article className="prose-reading mt-8 flex max-w-3xl flex-col gap-6 text-foreground">
				{children}
			</article>
		</section>
	);
}

export function BlogEmptyState() {
	return (
		<section className="min-w-0">
			<article className="rounded-[2rem] border border-border bg-card/70 p-7">
				<p className="ui-label text-muted-foreground">Current state</p>
				<h1 className="font-reading-heading mt-5 text-4xl text-foreground sm:text-5xl">
					No posts are published yet.
				</h1>
				<p className="font-reading-body mt-4 max-w-2xl text-muted-foreground">
					The route is ready to default to the newest post, but nothing ships
					here until it adds something the docs and product pages do not already
					explain.
				</p>
				<nav
					aria-label="Blog fallback links"
					className="mt-8 flex flex-col gap-3"
				>
					<TransitionLink
						href="/docs"
						className="interactive-link ui-nav text-foreground"
					>
						Read the docs
					</TransitionLink>
					<TransitionLink
						href="/pricing"
						className="interactive-link ui-nav text-foreground"
					>
						See pricing
					</TransitionLink>
					<TransitionLink
						href="/"
						className="interactive-link ui-nav text-foreground"
					>
						Back to home
					</TransitionLink>
				</nav>
			</article>
		</section>
	);
}
