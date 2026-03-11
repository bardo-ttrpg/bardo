import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import SiteNavLink from "@/components/site-nav-link";
import ThemeToggle from "@/components/theme-toggle";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { resolveOptionalUserId } from "@/lib/clerk-route-auth";
import AuthUserButton from "./auth-user-button";

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

const PRIMARY_NAV_LINKS = [
	{ href: "/docs/install", label: "Docs" },
	{ href: "/pricing", label: "Pricing" },
	{ href: "/legal", label: "Legal" },
] as const;

const FOOTER_PRODUCT_LINKS = [
	{ label: "Docs", href: "/docs/install" },
	{ label: "Pricing", href: "/pricing" },
	{ label: "Legal", href: "/legal" },
	{ label: "Sign up", href: "/sign-up" },
] as const;

const FOOTER_AGENTS = ["Claude Code", "Cursor", "Cline", "OpenCode"] as const;

const FOOTER_STACK = [
	"Any TTRPG system",
	"Markdown-first",
	"System-agnostic",
	"MCP protocol",
] as const;

const navLinkClass =
	"font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground";

function NavLink({ href, label }: { href: string; label: string }) {
	return <SiteNavLink href={href} label={label} className={navLinkClass} />;
}

function AuthCtaLinks() {
	return (
		<>
			<SiteNavLink href="/sign-in" label="Log in" className={navLinkClass} />
			<SiteNavLink
				href="/sign-up"
				label="Sign up ↗"
				className="border border-foreground/30 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
			/>
		</>
	);
}

function AuthControls({ isSignedIn }: { isSignedIn: boolean }) {
	if (!IS_CLERK_CONFIGURED || !isSignedIn) {
		return <AuthCtaLinks />;
	}

	return <AuthUserButton />;
}

function DashboardHeaderLink({ isSignedIn }: { isSignedIn: boolean }) {
	if (!IS_CLERK_CONFIGURED || !isSignedIn) {
		return null;
	}

	return <NavLink href="/dashboard" label="DASHBOARD" />;
}

export default async function SiteLayout({
	children,
}: {
	children: ReactNode;
}) {
	const userId = IS_CLERK_CONFIGURED
		? await resolveOptionalUserId("/(site)/layout", { authFn: auth })
		: null;
	const isSignedIn = Boolean(userId);

	const body = (
		<div className="min-h-screen text-foreground">
			<header className="sticky top-0 z-50 border-b border-border bg-background">
				<div className="mx-auto flex h-11 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6">
					<SiteNavLink
						href="/"
						label="Bardo"
						className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-foreground"
					/>

					<nav
						aria-label="Primary"
						className="hidden items-center gap-7 sm:flex"
					>
						{PRIMARY_NAV_LINKS.map((link) => (
							<NavLink key={link.href} href={link.href} label={link.label} />
						))}
						<DashboardHeaderLink isSignedIn={isSignedIn} />
					</nav>

					<div className="flex items-center gap-3">
						<AuthControls isSignedIn={isSignedIn} />
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
						<DashboardHeaderLink isSignedIn={isSignedIn} />
					</nav>
				</div>
			</header>

			<main id="main-content">{children}</main>

			<footer className="mt-24 border-t border-border bg-background/98">
				<div className="mx-auto max-w-7xl">
					<div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
						<div className="border-r border-border px-6 py-10 sm:px-8">
							<p className="mb-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Product
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
								Stack
							</p>
							<ul className="space-y-3">
								{FOOTER_STACK.map((item) => (
									<li
										key={item}
										className="font-mono text-xs text-muted-foreground"
									>
										{item}
									</li>
								))}
							</ul>
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
								View pricing ↗
							</Link>
						</div>
					</div>

					<div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-8">
						<span className="font-mono text-[11px] text-muted-foreground">
							© {new Date().getFullYear()} Bardo — MCP-driven TTRPG operations
						</span>
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/70">
							MCP · TTRPG · MARKDOWN · WORLDS · SESSION · STATE
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
