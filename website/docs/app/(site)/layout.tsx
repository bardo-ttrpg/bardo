import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import OptionalClerkProvider from "@/components/optional-clerk-provider";
import ThemeToggle from "@/components/theme-toggle";
import { isClerkAuthConfigured } from "@/lib/clerk-config";

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
	issuerDomain: process.env.CLERK_JWT_ISSUER_DOMAIN,
});

export default function SiteLayout({ children }: { children: ReactNode }) {
	const body = (
		<div className="min-h-screen text-foreground">
			{/* ── Header ── */}
			<header className="sticky top-0 z-50 border-b border-border bg-background">
				<div className="mx-auto flex h-11 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6">
					<Link
						href="/"
						className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-foreground"
					>
						Bardo
					</Link>

					<nav className="hidden items-center gap-7 sm:flex">
						<Link
							href="/mpc-docs"
							prefetch={false}
							className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
						>
							Docs
						</Link>
						<Link
							href="/dashboard"
							prefetch={false}
							className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
						>
							Dashboard
						</Link>
						<Link
							href="/pricing"
							prefetch={false}
							className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
						>
							Pricing
						</Link>
						<Link
							href="/legal"
							prefetch={false}
							className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
						>
							Legal
						</Link>
					</nav>

					<div className="flex items-center gap-3">
						{IS_CLERK_CONFIGURED ? (
							<>
								<SignedOut>
									<Link
										href="/sign-in"
										prefetch={false}
										className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
									>
										Log in
									</Link>
									<Link
										href="/sign-up"
										prefetch={false}
										className="border border-foreground/30 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
									>
										Sign up ↗
									</Link>
								</SignedOut>
								<SignedIn>
									<UserButton afterSignOutUrl="/" />
								</SignedIn>
							</>
						) : (
							<>
								<Link
									href="/sign-in"
									prefetch={false}
									className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
								>
									Log in
								</Link>
								<Link
									href="/sign-up"
									prefetch={false}
									className="border border-foreground/30 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
								>
									Sign up ↗
								</Link>
							</>
						)}
						<ThemeToggle />
					</div>
				</div>
			</header>

			{/* ── Content ── */}
			<main>{children}</main>

			{/* ── Footer ── */}
			<footer className="mt-24 border-t border-border bg-background">
				<div className="mx-auto max-w-7xl">
					<div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
						{/* Product */}
						<div className="border-r border-border px-6 py-10 sm:px-8">
							<p className="mb-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Product
							</p>
							<ul className="space-y-3">
								{[
									{ label: "Docs", href: "/mpc-docs" },
									{ label: "Dashboard", href: "/dashboard" },
									{ label: "Pricing", href: "/pricing" },
									{ label: "Legal", href: "/legal" },
									{ label: "Sign up", href: "/sign-up" },
								].map(({ label, href }) => (
									<li key={label}>
										<Link
											href={href}
											className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
										>
											{label}
										</Link>
									</li>
								))}
							</ul>
						</div>

						{/* Agents */}
						<div className="px-6 py-10 sm:border-r sm:border-border sm:px-8">
							<p className="mb-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Agents
							</p>
							<ul className="space-y-3">
								{["Claude Code", "Cursor", "Cline", "OpenCode"].map((a) => (
									<li
										key={a}
										className="font-mono text-xs text-muted-foreground"
									>
										{a}
									</li>
								))}
							</ul>
						</div>

						{/* Stack */}
						<div className="border-r border-t border-border px-6 py-10 sm:border-t-0 sm:px-8">
							<p className="mb-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Stack
							</p>
							<ul className="space-y-3">
								{[
									"Any TTRPG system",
									"Markdown-first",
									"System-agnostic",
									"MCP protocol",
								].map((a) => (
									<li
										key={a}
										className="font-mono text-xs text-muted-foreground"
									>
										{a}
									</li>
								))}
							</ul>
						</div>

						{/* CTA */}
						<div className="border-t border-border px-6 py-10 sm:border-t-0 sm:px-8">
							<p className="mb-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Get started
							</p>
							<Link
								href="/mpc-docs"
								className="inline-block border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
							>
								Read the docs ↗
							</Link>
						</div>
					</div>

					{/* Bottom bar */}
					<div className="flex items-center justify-between px-6 py-5 sm:px-8">
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

	const themedBody = (
		<ThemeProvider
			attribute="class"
			defaultTheme="dark"
			themes={["dark", "light"]}
			disableTransitionOnChange
		>
			{body}
		</ThemeProvider>
	);

	if (!IS_CLERK_CONFIGURED) {
		return themedBody;
	}
	return (
		<OptionalClerkProvider enabled={IS_CLERK_CONFIGURED}>
			{themedBody}
		</OptionalClerkProvider>
	);
}
