import type { ReactNode } from "react";
import { TransitionLink } from "@/components/transition-link";
import { BardoViewTransition } from "@/components/view-transition";
import type { BlogEntry } from "@/content/site-content";
import { listBlogEntries } from "@/content/site-content";
import { cn } from "@/lib/utils";

export function BlogIndexShell({ children }: { children: ReactNode }) {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pb-10 pt-8 sm:px-8 sm:pb-12 sm:pt-8 lg:pb-16 lg:pt-10">
			<div className="flex flex-col gap-10">{children}</div>
		</main>
	);
}

export function BlogEntryShell({
	entry,
	children,
}: {
	entry: BlogEntry;
	children: ReactNode;
}) {
	const entries = listBlogEntries();

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pb-10 pt-8 sm:px-8 sm:pb-12 sm:pt-8 lg:pb-16 lg:pt-10">
			<div className="flex flex-col gap-10">
				<div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-14">
					<BardoViewTransition>
						<aside className="lg:sticky lg:top-10 lg:self-start">
							<nav
								aria-label="Blog posts"
								className="flex flex-col gap-2 border-b border-border pb-6 lg:border-b-0 lg:pb-0"
							>
								<div className="flex flex-col">
									{entries.map((item) => {
										const isCurrentPage = item.href === entry.href;
										return (
											<TransitionLink
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
													{item.title}
												</span>
											</TransitionLink>
										);
									})}
								</div>
							</nav>
						</aside>
					</BardoViewTransition>
					<BardoViewTransition>
						<div className="min-w-0">
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
						</div>
					</BardoViewTransition>
				</div>
			</div>
		</main>
	);
}
