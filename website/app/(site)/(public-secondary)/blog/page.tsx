import { redirect } from "next/navigation";
import { getLatestBlogEntry } from "@/content/site-content";
import { createPublicMetadata } from "@/lib/site-metadata";
import { BlogEmptyState } from "./_components/blog-shell";

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

	return <BlogEmptyState />;
}
