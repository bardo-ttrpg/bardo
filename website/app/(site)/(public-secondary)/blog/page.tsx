import Link from "next/link";
import { listBlogEntries } from "@/content/site-content";
import { createPublicMetadata } from "@/lib/site-metadata";

export const metadata = createPublicMetadata({
	title: "Blog",
	description: "Notes from Bardo when there is something worth publishing.",
	path: "/blog",
});

export default function BlogPage() {
	const entries = listBlogEntries();
	const featuredEntry = entries[0] ?? null;
	const remainingEntries = featuredEntry ? entries.slice(1) : [];

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pb-10 pt-8 sm:px-8 sm:pb-12 sm:pt-8 lg:pb-16 lg:pt-10">
			<div className="flex flex-col gap-10">
				<header className="grid gap-6 border-b border-border pb-8 lg:grid-cols-[minmax(0,1.4fr)_16rem] lg:items-end">
					<div className="flex flex-col gap-4">
						<p className="ui-label text-muted-foreground">Blog</p>
						<h1 className="font-reading-heading text-5xl text-foreground sm:text-6xl">
							Writing only when it earns the page.
						</h1>
						<p className="font-reading-body max-w-3xl text-lg text-muted-foreground">
							Bardo posts stay closer to product notes than content marketing:
							releases, technical explanations, and the occasional opinion only
							when it helps users understand the product better.
						</p>
					</div>
					<div className="rounded-3xl border border-border bg-card/60 p-5">
						<p className="ui-label text-muted-foreground">Status</p>
						<p className="font-reading-heading mt-3 text-4xl text-foreground">
							{String(entries.length).padStart(2, "0")}
						</p>
						<p className="font-reading-body mt-2 text-sm text-muted-foreground">
							Published entries right now.
						</p>
					</div>
				</header>

				{featuredEntry ? (
					<div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
						<Link
							href={featuredEntry.href}
							className="group rounded-[2rem] border border-border bg-card/70 p-7 transition-colors hover:bg-muted/30"
						>
							<p className="ui-label text-muted-foreground">
								{featuredEntry.publishedAt}
							</p>
							<h2 className="font-reading-heading mt-5 text-4xl text-foreground">
								{featuredEntry.title}
							</h2>
							<p className="font-reading-body mt-4 max-w-2xl text-muted-foreground">
								{featuredEntry.preview ?? featuredEntry.description}
							</p>
							<p className="ui-nav mt-6 text-foreground">Read post</p>
						</Link>
						<div className="flex flex-col gap-4">
							{remainingEntries.length > 0 ? (
								remainingEntries.map((entry) => (
									<Link
										key={entry.href}
										href={entry.href}
										className="rounded-3xl border border-border bg-card/50 p-5 transition-colors hover:bg-muted/30"
									>
										<p className="ui-label text-muted-foreground">
											{entry.publishedAt}
										</p>
										<h3 className="font-reading-heading mt-4 text-2xl text-foreground">
											{entry.title}
										</h3>
										<p className="font-reading-body mt-3 text-muted-foreground">
											{entry.preview ?? entry.description}
										</p>
									</Link>
								))
							) : (
								<div className="rounded-3xl border border-border bg-muted/20 p-5">
									<p className="ui-label text-muted-foreground">Up next</p>
									<p className="font-reading-body mt-3 text-muted-foreground">
										Future posts will land here in the same feed once they are
										published from the local manifest.
									</p>
								</div>
							)}
						</div>
					</div>
				) : (
					<section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
						<div className="rounded-[2rem] border border-border bg-card/70 p-7">
							<p className="ui-label text-muted-foreground">Current state</p>
							<h2 className="font-reading-heading mt-5 text-4xl text-foreground">
								No posts are published yet.
							</h2>
							<p className="font-reading-body mt-4 max-w-2xl text-muted-foreground">
								The route is live and ready for static MDX entries, but nothing
								ships here until it adds something the docs and pricing pages do
								not already explain.
							</p>
						</div>
						<div className="flex flex-col gap-4">
							<div className="rounded-3xl border border-border bg-muted/20 p-5">
								<p className="ui-label text-muted-foreground">Meanwhile</p>
								<div className="mt-4 flex flex-col gap-3">
									<Link href="/docs" className="interactive-link ui-nav text-foreground">
										Read the docs
									</Link>
									<Link
										href="/pricing"
										className="interactive-link ui-nav text-foreground"
									>
										See pricing
									</Link>
									<Link href="/" className="interactive-link ui-nav text-foreground">
										Back to home
									</Link>
								</div>
							</div>
							<div className="rounded-3xl border border-border bg-card/50 p-5">
								<p className="ui-label text-muted-foreground">Publishing model</p>
								<p className="font-reading-body mt-3 text-muted-foreground">
									Posts are still sourced from the local blog manifest and stay
									fully static when they appear.
								</p>
							</div>
						</div>
					</section>
				)}
			</div>
		</main>
	);
}
