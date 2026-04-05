import type { ReactNode } from "react";
import { listLegalEntries } from "@/content/legal-content";
import { LegalLayoutShell } from "./_components/legal-shell";

export default function LegalLayout({ children }: { children: ReactNode }) {
	const entries = listLegalEntries().map((entry) => ({
		href: entry.href,
		navigationLabel: entry.navigationLabel,
	}));

	return <LegalLayoutShell entries={entries}>{children}</LegalLayoutShell>;
}
