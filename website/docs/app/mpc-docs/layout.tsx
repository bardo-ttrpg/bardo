import { unstable_cache } from "next/cache";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import type { ReactNode } from "react";
import "nextra-theme-docs/style.css";

export const dynamic = "force-static";

const getCachedPageMap = unstable_cache(
	async () => getPageMap("/mpc-docs"),
	["mpc-docs-page-map"],
	{ revalidate: 3600 },
);

export default async function MpcDocsLayout({
	children,
}: {
	children: ReactNode;
}) {
	const pageMap = await getCachedPageMap();

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
