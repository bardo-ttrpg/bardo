import { notFound } from "next/navigation";
import {
	getBlogEntryBySlug,
	listBlogStaticParams,
} from "@/content/site-content";
import { createPublicMetadata } from "@/lib/site-metadata";
import {
	PublicPageHeader,
	PublicPageShell,
} from "../../_components/site-shells";

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
			description:
				"Writing lives here only when there is something useful to say.",
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
		<PublicPageShell>
			<PublicPageHeader
				eyebrow="Blog"
				title={entry.title}
				description={entry.description}
			/>
			<article className="prose-reading space-y-6 text-foreground">
				<Content />
			</article>
		</PublicPageShell>
	);
}
