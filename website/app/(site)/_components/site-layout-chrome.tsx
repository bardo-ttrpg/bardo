"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteBrandHeaderFrame } from "./site-shells";

function shouldShowSiteHeader(pathname: string | null) {
	if (!pathname) {
		return true;
	}

	return !(
		pathname.startsWith("/docs") ||
		pathname.startsWith("/sign-in") ||
		pathname.startsWith("/sign-up") ||
		pathname.startsWith("/forgot-password")
	);
}

export function SiteLayoutChrome({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const showHeader = shouldShowSiteHeader(pathname);

	return (
		<div className="min-h-screen">
			{showHeader ? <SiteBrandHeaderFrame /> : null}
			{children}
		</div>
	);
}
