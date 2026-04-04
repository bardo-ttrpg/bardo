import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
	listDocsGroupsWithEntries,
	listDocsSearchEntries,
} from "@/content/site-content";
import { DocsShell } from "./_components/docs-shell";

export default function DocsLayout({ children }: { children: ReactNode }) {
	const groups = listDocsGroupsWithEntries().map((group) => ({
		id: group.id,
		label: group.label,
		entries: group.entries.map((entry) => ({
			href: entry.href,
			title: entry.title,
			navigationLabel: entry.navigationLabel,
			sections: entry.sections,
		})),
	}));
	const searchEntries = listDocsSearchEntries();

	return (
		<TooltipProvider>
			<DocsShell groups={groups} searchEntries={searchEntries}>
				{children}
			</DocsShell>
		</TooltipProvider>
	);
}
