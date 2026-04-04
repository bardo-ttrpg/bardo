import type { ReactNode } from "react";
import { SiteBrandHeaderFrame } from "../_components/site-shells";

export default function PublicSecondaryLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="min-h-screen">
			<SiteBrandHeaderFrame />
			{children}
		</div>
	);
}
