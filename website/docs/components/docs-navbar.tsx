import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import ThemeToggle from "@/components/theme-toggle";
import { isClerkAuthConfigured } from "@/lib/clerk-config";

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
	issuerDomain: process.env.CLERK_JWT_ISSUER_DOMAIN,
});

const navLinkClass =
	"font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground";

const NAV_LINKS = [
	{ href: "/mpc-docs", label: "Docs" },
	{ href: "/pricing", label: "Pricing" },
	{ href: "/dashboard", label: "Dashboard" },
] as const;

function AuthControls() {
	if (!IS_CLERK_CONFIGURED) {
		return (
			<>
				<Link href="/sign-in" prefetch={false} className={navLinkClass}>
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
		);
	}

	return (
		<>
			<SignedOut>
				<Link href="/sign-in" prefetch={false} className={navLinkClass}>
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
	);
}

/** Bardo-branded nav bar for the /mpc-docs section */
export default function DocsNavbar() {
	return (
		<header className="sticky top-0 z-50 border-b border-border bg-background">
			<div className="mx-auto flex h-11 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6">
				<Link
					href="/"
					className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-foreground"
				>
					Bardo
				</Link>

				<nav aria-label="Primary" className="hidden items-center gap-7 sm:flex">
					{NAV_LINKS.map((link) => (
						<Link
							key={link.href}
							href={link.href}
							prefetch={false}
							className={navLinkClass}
						>
							{link.label}
						</Link>
					))}
				</nav>

				<div className="flex items-center gap-3">
					<AuthControls />
					<ThemeToggle />
				</div>
			</div>

			{/* Mobile nav row */}
			<div className="sm:hidden">
				<nav
					aria-label="Mobile"
					className="mx-auto flex max-w-7xl items-center gap-5 overflow-x-auto px-4 py-2.5"
				>
					{NAV_LINKS.map((link) => (
						<Link
							key={`mobile-${link.href}`}
							href={link.href}
							prefetch={false}
							className={navLinkClass}
						>
							{link.label}
						</Link>
					))}
				</nav>
			</div>
		</header>
	);
}
