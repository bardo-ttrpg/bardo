import Image from "next/image";
import Link from "next/link";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import SiteNavLink from "@/components/site-nav-link";
import ThemeToggle from "@/components/theme-toggle";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { SiteAuthControls, SiteDashboardHeaderLink } from "./site-auth-chrome";

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

const PRIMARY_NAV_LINKS = [
	{ href: "/docs", label: "Docs" },
	{ href: "/pricing", label: "Pricing" },
] as const;

const FOOTER_PRODUCT_LINKS = [
	{ label: "Docs", href: "/docs" },
	{ label: "Pricing", href: "/pricing" },
	{ label: "Sign up", href: "/sign-up" },
] as const;

const FOOTER_AGENTS = ["Claude Code", "Cursor", "Cline", "OpenCode"] as const;

const navLinkClass =
	"font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground";

function NavLink({ href, label }: { href: string; label: string }) {
	return <SiteNavLink href={href} label={label} className={navLinkClass} />;
}

export default function SiteLayout({ children }: { children: ReactNode }) {
	const body = (
		<div className="min-h-screen text-foreground px-20">
			<header className="sticky top-0 z-50 backdrop-blur py-2">
				<div className="mx-auto flex h-11 items-center justify-between gap-8">
					<Link
						href="/"
						prefetch={false}
						aria-label="Bardo"
						className="flex items-center"
					>
						<Image
							src="/icon.svg"
							alt="Bardo"
							width={28}
							height={28}
							priority
							style={{
								animation: "fade-in-up 0.6s ease-out 0.1s forwards",
								opacity: 0,
							}}
						/>
					</Link>

					<nav
						aria-label="Primary"
						className="hidden items-center gap-7 sm:flex"
					>
						{PRIMARY_NAV_LINKS.map((link) => (
							<NavLink key={link.href} href={link.href} label={link.label} />
						))}
						<SiteDashboardHeaderLink enabled={IS_CLERK_CONFIGURED} />
					</nav>

					<div className="flex items-center gap-3">
						<SiteAuthControls enabled={IS_CLERK_CONFIGURED} />
						<ThemeToggle />
					</div>
				</div>

				<div className="sm:hidden">
					<nav
						aria-label="Mobile"
						className="mx-auto flex max-w-7xl items-center gap-5 overflow-x-auto px-4 py-2.5"
					>
						{PRIMARY_NAV_LINKS.map((link) => (
							<NavLink
								key={`mobile-${link.href}`}
								href={link.href}
								label={link.label}
							/>
						))}
						<SiteDashboardHeaderLink enabled={IS_CLERK_CONFIGURED} />
					</nav>
				</div>
			</header>

			<main id="main-content">{children}</main>

			<footer className="mt-24 border-t border-border bg-background/98">
				<div className="mx-auto max-w-7xl">
					<div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
						<div className="border-r border-border px-6 py-10 sm:px-8">
							<p className="mb-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Pages
							</p>
							<ul className="space-y-3">
								{FOOTER_PRODUCT_LINKS.map(({ label, href }) => (
									<li key={label}>
										<Link
											href={href}
											prefetch={false}
											className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
										>
											{label}
										</Link>
									</li>
								))}
							</ul>
						</div>

						<div className="px-6 py-10 sm:border-r sm:border-border sm:px-8">
							<p className="mb-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Agents
							</p>
							<ul className="space-y-3">
								{FOOTER_AGENTS.map((agent) => (
									<li
										key={agent}
										className="font-mono text-xs text-muted-foreground"
									>
										{agent}
									</li>
								))}
							</ul>
						</div>

						<div className="border-r border-t border-border px-6 py-10 sm:border-t-0 sm:px-8">
							<p className="mb-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Blogs
							</p>
						</div>

						<div className="border-t border-border px-6 py-10 sm:border-t-0 sm:px-8">
							<p className="mb-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Get started
							</p>
							<Link
								href="/pricing"
								prefetch={false}
								className="inline-block border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
							>
								View Pricing ↗
							</Link>
						</div>
					</div>

					<div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-8">
						<span className="font-mono text-[11px] text-muted-foreground">
							© {new Date().getFullYear()} Bardo — paid remote MCP for tabletop
							campaign continuity
						</span>
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/70">
							MCP · TTRPG · MARKDOWN · CANON · CONTINUITY · STATE
						</span>
					</div>
				</div>
			</footer>
		</div>
	);

	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="dark"
			themes={["dark", "light"]}
			disableTransitionOnChange
		>
			{body}
		</ThemeProvider>
	);
}
