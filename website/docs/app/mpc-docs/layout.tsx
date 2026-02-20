import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import type { ReactNode } from "react";
import "nextra-theme-docs/style.css";
import "./docs-theme.css";
import OptionalClerkProvider from "@/components/optional-clerk-provider";
import { isClerkAuthConfigured } from "@/lib/clerk-config";

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
	issuerDomain: process.env.CLERK_JWT_ISSUER_DOMAIN,
});

const getCachedPageMap = unstable_cache(
	async () => getPageMap("/mpc-docs"),
	["mpc-docs-page-map"],
	{ revalidate: 3600 },
);

const NAV_LINK_CLASS =
	"bardo-nav-link font-mono text-[11px] uppercase tracking-widest transition-colors";

const SIGN_UP_CLASS =
	"bardo-signup-btn font-mono text-[11px] uppercase tracking-widest transition-colors";

export default async function MpcDocsLayout({
	children,
}: {
	children: ReactNode;
}) {
	const pageMap = await getCachedPageMap();

	const authControls = IS_CLERK_CONFIGURED ? (
		<>
			<SignedOut>
				<Link href="/sign-in" className={NAV_LINK_CLASS}>
					Log in
				</Link>
				<Link href="/sign-up" className={SIGN_UP_CLASS}>
					Sign up ↗
				</Link>
			</SignedOut>
			<SignedIn>
				<UserButton afterSignOutUrl="/" />
			</SignedIn>
		</>
	) : (
		<>
			<Link href="/sign-in" className={NAV_LINK_CLASS}>
				Log in
			</Link>
			<Link href="/sign-up" className={SIGN_UP_CLASS}>
				Sign up ↗
			</Link>
		</>
	);

	const navbar = (
		<Navbar
			logo={
				<span className="font-mono text-sm font-bold uppercase tracking-[0.2em]">
					Bardo
				</span>
			}
			logoLink="/"
			align="right"
		>
			<nav className="bardo-docs-nav hidden items-center gap-7 sm:flex">
				<Link href="/mpc-docs" className={NAV_LINK_CLASS}>
					Docs
				</Link>
				<Link href="/pricing" className={NAV_LINK_CLASS}>
					Pricing
				</Link>
				<Link href="/dashboard" className={NAV_LINK_CLASS}>
					Dashboard
				</Link>
			</nav>
			<div className="flex items-center gap-3">{authControls}</div>
		</Navbar>
	);

	const footer = (
		<Footer>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "1rem",
					width: "100%",
				}}
			>
				<span className="bardo-footer-copy">
					© {new Date().getFullYear()} Bardo — MCP-driven TTRPG operations
				</span>
				<div style={{ display: "flex", gap: "1.5rem" }}>
					{[
						{ href: "/", label: "Home" },
						{ href: "/pricing", label: "Pricing" },
						{ href: "/dashboard", label: "Dashboard" },
					].map(({ href, label }) => (
						<Link key={href} href={href} className="bardo-footer-link">
							{label}
						</Link>
					))}
				</div>
			</div>
		</Footer>
	);

	const body = (
		<Layout
			pageMap={pageMap}
			navbar={navbar}
			footer={footer}
			docsRepositoryBase="https://github.com/bardohq/bardo/tree/main/website/docs/content"
			editLink="Edit this page"
			copyPageButton={false}
			search={null}
			sidebar={{
				defaultOpen: true,
				autoCollapse: false,
				defaultMenuCollapseLevel: 2,
				toggleButton: true,
			}}
			toc={{
				float: true,
				title: (
					<span
						style={{
							fontFamily: "var(--font-geist-mono, ui-monospace, monospace)",
							fontSize: "9px",
							letterSpacing: "0.14em",
							textTransform: "uppercase",
						}}
					>
						/ On this page
					</span>
				),
			}}
			nextThemes={{
				attribute: "class",
				defaultTheme: "dark",
				disableTransitionOnChange: true,
				storageKey: "bardo-docs-theme",
			}}
		>
			{children}
		</Layout>
	);

	return (
		<OptionalClerkProvider enabled={IS_CLERK_CONFIGURED}>
			{body}
		</OptionalClerkProvider>
	);
}
