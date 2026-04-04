import Link from "next/link";
import { notFound } from "next/navigation";
import {
	getBlogEntryBySlug,
	listBlogStaticParams,
} from "@/content/site-content";
import { createPublicMetadata } from "@/lib/site-metadata";

export const dynamicParams = false;

export function generateStaticParams() {
	return listBlogStaticParams();
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const entry = getBlogEntryBySlug(slug);

	if (!entry) {
		return createPublicMetadata({
			title: "Blog",
			description: "Notes from Bardo when there is something worth publishing.",
			path: "/blog",
		});
	}

	return createPublicMetadata({
		title: entry.title,
		description: entry.description,
		path: entry.href,
		type: "article",
	});
}

export default async function BlogEntryPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const entry = getBlogEntryBySlug(slug);

	if (!entry) {
		notFound();
	}

	const Content = (await entry.load()).default;

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pb-10 pt-8 sm:px-8 sm:pb-12 sm:pt-8 lg:pb-16 lg:pt-10">
			<div className="flex flex-col gap-10">
				<header className="flex max-w-3xl flex-col gap-5 border-b border-border pb-8">
					<p className="ui-label text-muted-foreground">Blog</p>
					<div className="flex flex-col gap-3">
						<h1 className="font-reading-heading text-4xl text-foreground sm:text-5xl">
							{entry.title}
						</h1>
						<p className="font-reading-body max-w-2xl text-lg text-muted-foreground">
							{entry.description}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
						<span className="ui-label">{entry.publishedAt}</span>
						<Link href="/blog" className="interactive-link ui-nav text-foreground">
							Back to blog
						</Link>
					</div>
				</header>
				<article className="prose-reading flex max-w-3xl flex-col gap-6 text-foreground">
					<Content />
				</article>
			</div>
		</main>
	);
}
