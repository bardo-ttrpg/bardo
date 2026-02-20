import type { ReactNode } from "react";

export default function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<p className="mb-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
			/ {children}
		</p>
	);
}
