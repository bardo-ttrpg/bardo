import type { ReactNode } from "react";
import { BardoViewTransition } from "@/components/view-transition";
import type { LegalEntry } from "@/content/legal-content";
import { getLegalBreadcrumbJsonLd } from "@/lib/site-seo";
import { LegalSidebarNav } from "./legal-sidebar-nav";

type LegalSidebarEntry = {
	href: string;
	navigationLabel: string;
};

export function LegalLayoutShell({
	entries,
	children,
}: {
	entries: readonly LegalSidebarEntry[];
	children: ReactNode;
}) {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pb-10 pt-8 sm:px-8 sm:pb-12 sm:pt-8 lg:pb-16 lg:pt-10">
			<section className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-14">
				<aside className="bardo-persistent-surface lg:sticky lg:top-10 lg:self-start">
					<LegalSidebarNav entries={entries} />
				</aside>
				<BardoViewTransition name="bardo-page-region">
					<section className="bardo-page-region min-w-0">{children}</section>
				</BardoViewTransition>
			</section>
		</main>
	);
}

export function LegalEntryContent({
	entry,
	children,
}: {
	entry: LegalEntry;
	children: ReactNode;
}) {
	const breadcrumbJsonLd = JSON.stringify(getLegalBreadcrumbJsonLd(entry));

	return (
		<section className="min-w-0">
			<script type="application/ld+json">{breadcrumbJsonLd}</script>
			<header className="flex max-w-3xl flex-col gap-5 border-b border-border pb-8">
				<div className="flex flex-col gap-3">
					<h1 className="font-reading-heading text-4xl text-foreground sm:text-5xl">
						{entry.title}
					</h1>
					<p className="font-reading-body max-w-2xl text-lg text-muted-foreground">
						{entry.summary}
					</p>
				</div>
				<dl className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
					<div className="flex flex-col gap-1">
						<dt className="ui-label text-muted-foreground">Effective</dt>
						<dd className="font-reading-body text-foreground">
							{entry.effectiveDate}
						</dd>
					</div>
					<div className="flex flex-col gap-1">
						<dt className="ui-label text-muted-foreground">Last updated</dt>
						<dd className="font-reading-body text-foreground">
							{entry.lastUpdated}
						</dd>
					</div>
				</dl>
			</header>
			<article className="prose-reading mt-8 flex max-w-3xl flex-col gap-8 text-foreground">
				{children}
			</article>
		</section>
	);
}

export function LegalSection({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<section id={id} className="scroll-mt-24">
			<header className="flex flex-col gap-4">
				<h2 className="font-reading-heading text-3xl text-foreground">
					{title}
				</h2>
			</header>
			<div className="mt-4 flex flex-col gap-4">{children}</div>
		</section>
	);
}
