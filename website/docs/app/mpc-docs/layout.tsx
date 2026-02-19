import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import type { ReactNode } from "react";
import "nextra-theme-docs/style.css";

export default async function MpcDocsLayout({
	children,
}: {
	children: ReactNode;
}) {
	const pageMap = await getPageMap("/mpc-docs");

	return (
		<Layout
			pageMap={pageMap}
			navbar={<Navbar logo={<span>Bardo</span>} />}
			footer={
				<Footer>
					{new Date().getFullYear()} © Bardo. Markdown-first TTRPG operations.
				</Footer>
			}
		>
			{children}
		</Layout>
	);
}
