import { notFound } from "next/navigation";
import {
	getBlogEntryBySlug,
	listBlogStaticParams,
} from "@/content/site-content";
import { createPublicMetadata } from "@/lib/site-metadata";
import { BlogEntryContent } from "../_components/blog-shell";

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
		<BlogEntryContent entry={entry}>
			<Content />
		</BlogEntryContent>
	);
}
