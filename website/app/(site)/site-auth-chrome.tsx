"use client";

import { ClerkLoaded, UserButton, useAuth } from "@clerk/nextjs";
import SiteNavLink from "@/components/site-nav-link";

const navLinkClass =
	"inline-flex items-center rounded-full px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground";

function AuthCtaLinks() {
	return (
		<>
			<SiteNavLink href="/sign-in" label="Log in" className={navLinkClass} />
			<SiteNavLink
				href="/sign-up"
				label="Sign up ↗"
				className="rounded-full border border-foreground/30 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
			/>
		</>
	);
}

export function SiteAuthControls({ enabled }: { enabled: boolean }) {
	if (!enabled) {
		return <AuthCtaLinks />;
	}

	return <EnabledSiteAuthControls />;
}

function EnabledSiteAuthControls() {
	const { isLoaded, isSignedIn } = useAuth();

	return (
		<>
			{!isLoaded ? <AuthCtaLinks /> : null}
			<ClerkLoaded>
				{isSignedIn ? <UserButton /> : <AuthCtaLinks />}
			</ClerkLoaded>
		</>
	);
}

export function SiteDashboardHeaderLink({ enabled }: { enabled: boolean }) {
	if (!enabled) {
		return null;
	}

	return <EnabledSiteDashboardHeaderLink />;
}

function EnabledSiteDashboardHeaderLink() {
	const { isLoaded, isSignedIn } = useAuth();

	if (!isLoaded || !isSignedIn) {
		return null;
	}

	return (
		<ClerkLoaded>
			<SiteNavLink
				href="/dashboard"
				label="DASHBOARD"
				className={navLinkClass}
			/>
		</ClerkLoaded>
	);
}
