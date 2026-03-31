import { notFound } from "next/navigation";
import {
	getDocsEntryBySlug,
	listDocsStaticParams,
} from "@/content/site-content";
import { createPublicMetadata } from "@/lib/site-metadata";
import { InlineLinkNav, PublicPageHeader } from "../../_components/site-shells";

export const dynamicParams = false;

export function generateStaticParams() {
	return listDocsStaticParams();
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug?: string[] }>;
}) {
	const { slug } = await params;
	const entry = getDocsEntryBySlug(slug ?? []);

	if (!entry) {
		return createPublicMetadata({
			title: "Docs",
			description: "Plain answers for the essential Bardo flows.",
			path: "/docs",
		});
	}

	return createPublicMetadata({
		title: entry.title,
		description: entry.description,
		path: entry.href,
		type: "article",
	});
}

export default async function DocsEntryPage({
	params,
}: {
	params: Promise<{ slug?: string[] }>;
}) {
	const { slug } = await params;
	const entry = getDocsEntryBySlug(slug ?? []);

	if (!entry) {
		notFound();
	}

	const Content = (await entry.load()).default;

	return (
		<article className="space-y-10">
			<PublicPageHeader
				eyebrow={entry.eyebrow}
				title={entry.title}
				description={entry.description}
			/>
			<div className="prose-reading space-y-6 text-foreground">
				<Content />
			</div>
			<InlineLinkNav
				links={[
					{ href: "/", label: "Home" },
					{ href: "/dashboard", label: "Dashboard" },
					{ href: "/blog", label: "Blog" },
				]}
			/>
		</article>
	);
}
