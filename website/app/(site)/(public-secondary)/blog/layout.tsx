import type { ReactNode } from "react";
import { listBlogEntries } from "@/content/site-content";
import { BlogLayoutShell } from "./_components/blog-shell";

export default function BlogLayout({ children }: { children: ReactNode }) {
	const entries = listBlogEntries().map((entry) => ({
		href: entry.href,
		title: entry.title,
	}));

	return <BlogLayoutShell entries={entries}>{children}</BlogLayoutShell>;
}
