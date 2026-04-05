import type { ReactNode } from "react";
import { SiteLayoutChrome } from "./_components/site-layout-chrome";

export default function SiteLayout({ children }: { children: ReactNode }) {
	return <SiteLayoutChrome>{children}</SiteLayoutChrome>;
}
