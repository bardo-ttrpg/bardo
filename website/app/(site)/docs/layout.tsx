import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { listDocsEntries } from "@/content/site-content";
import { DocsShell } from "./_components/docs-shell";

export default function DocsLayout({ children }: { children: ReactNode }) {
	const items = listDocsEntries().map((entry) => ({
		href: entry.href,
		label: entry.navigationLabel,
		description: entry.description,
	}));

	return (
		<TooltipProvider>
			<DocsShell items={items}>{children}</DocsShell>
		</TooltipProvider>
	);
}
