import { redirect } from "next/navigation";
import { TransitionLink } from "@/components/transition-link";
import { BardoViewTransition } from "@/components/view-transition";
import { getLatestBlogEntry } from "@/content/site-content";
import { createPublicMetadata } from "@/lib/site-metadata";
import { BlogIndexShell } from "./_components/blog-shell";

export const metadata = createPublicMetadata({
	title: "Blog",
	description: "Notes from Bardo when there is something worth publishing.",
	path: "/blog",
});

export default function BlogPage() {
	const latestEntry = getLatestBlogEntry();

	if (latestEntry) {
		redirect(latestEntry.href);
	}

	return (
		<BlogIndexShell>
			<section className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-14">
				<div className="border-b border-border pb-6 lg:border-b-0 lg:pb-0">
					<p className="ui-label text-muted-foreground">Blog</p>
				</div>
				<BardoViewTransition>
					<div className="min-w-0">
					<div className="rounded-[2rem] border border-border bg-card/70 p-7">
						<p className="ui-label text-muted-foreground">Current state</p>
						<h1 className="font-reading-heading mt-5 text-4xl text-foreground sm:text-5xl">
							No posts are published yet.
						</h1>
						<p className="font-reading-body mt-4 max-w-2xl text-muted-foreground">
							The route is ready to default to the newest post, but nothing
							ships here until it adds something the docs and product pages do
							not already explain.
						</p>
						<div className="mt-8 flex flex-col gap-3">
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
						</div>
					</div>
					</div>
				</BardoViewTransition>
			</section>
		</BlogIndexShell>
	);
}
