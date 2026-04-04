import Link from "next/link";
import type { ReactNode } from "react";
import type { LegalEntry } from "@/content/legal-content";
import { listLegalEntries } from "@/content/legal-content";
import { getLegalBreadcrumbJsonLd } from "@/lib/site-seo";
import { cn } from "@/lib/utils";

export function LegalIndexShell({ children }: { children: ReactNode }) {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pb-10 pt-8 sm:px-8 sm:pb-12 sm:pt-8 lg:pb-16 lg:pt-10">
			<div className="flex flex-col gap-10">{children}</div>
		</main>
	);
}

export function LegalEntryShell({
	entry,
	children,
}: {
	entry: LegalEntry;
	children: ReactNode;
}) {
	const breadcrumbJsonLd = JSON.stringify(getLegalBreadcrumbJsonLd(entry));
	const legalEntries = listLegalEntries();

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pb-10 pt-8 sm:px-8 sm:pb-12 sm:pt-8 lg:pb-16 lg:pt-10">
			<script type="application/ld+json">{breadcrumbJsonLd}</script>
			<div className="flex flex-col gap-10">
				<div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-14">
					<aside className="lg:sticky lg:top-10 lg:self-start">
						<nav
							aria-label="Legal sections"
							className="flex flex-col gap-2 border-b border-border pb-6 lg:border-b-0 lg:pb-0"
						>
							<div className="flex justify-between lg:flex-col">
								{legalEntries.map((item) =>
									(() => {
										const isCurrentPage = item.href === entry.href;

										return (
											<Link
												key={item.href}
												href={item.href}
												className="rounded-none bg-transparent py-2 transition-colors hover:bg-transparent lg:py-2"
											>
												<span
													className={cn(
														"ui-nav",
														isCurrentPage
															? "font-medium !text-foreground"
															: "!text-muted-foreground hover:!text-foreground",
													)}
												>
													{item.navigationLabel}
												</span>
											</Link>
										);
									})(),
								)}
							</div>
						</nav>
					</aside>
					<div className="min-w-0">
						<header className="flex max-w-3xl flex-col gap-5 border-b border-border pb-8">
							{/* <p className="ui-label text-muted-foreground">{entry.eyebrow}</p> */}
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
									<dt className="ui-label text-muted-foreground">
										Last updated
									</dt>
									<dd className="font-reading-body text-foreground">
										{entry.lastUpdated}
									</dd>
								</div>
							</dl>
						</header>
						<article className="prose-reading mt-8 flex max-w-3xl flex-col gap-8 text-foreground">
							{children}
						</article>
					</div>
				</div>
			</div>
		</main>
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
			<div className="flex flex-col gap-4">
				<h2 className="font-reading-heading text-3xl text-foreground">
					{title}
				</h2>
				<div className="flex flex-col gap-4">{children}</div>
			</div>
		</section>
	);
}
