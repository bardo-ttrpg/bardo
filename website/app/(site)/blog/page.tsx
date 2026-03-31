import Link from "next/link";
import { listBlogEntries } from "@/content/site-content";
import { createPublicMetadata } from "@/lib/site-metadata";
import {
	InlineLinkNav,
	ProseSection,
	PublicPageHeader,
	PublicPageShell,
} from "../_components/site-shells";

export const metadata = createPublicMetadata({
	title: "Blog",
	description: "Writing lives here only when there is something useful to say.",
	path: "/blog",
});

export default function BlogPage() {
	const entries = listBlogEntries();

	return (
		<PublicPageShell>
			<PublicPageHeader
				eyebrow="Blog"
				title="Writing only when it earns the page."
				description="Posts live in local MDX, stay statically generated, and only ship when they add something the docs should not."
			/>
			{entries.length > 0 ? (
				<ProseSection title="Posts">
					<ul className="space-y-3 pl-0">
						{entries.map((entry) => (
							<li key={entry.href} className="list-none">
								<Link
									href={entry.href}
									className="font-reading-body underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
								>
									{entry.title}
								</Link>
								<p className="font-reading-body text-foreground">
									{entry.preview ?? entry.description}
								</p>
							</li>
						))}
					</ul>
				</ProseSection>
			) : (
				<ProseSection title="Current state">
					<p>
						No entries are published yet. The route is wired for MDX posts, but
						nothing ships until it earns the page.
					</p>
				</ProseSection>
			)}
			<InlineLinkNav
				links={[
					{ href: "/", label: "Home" },
					{ href: "/docs", label: "Docs" },
				]}
			/>
		</PublicPageShell>
	);
}
