"use client";

import { SignOutButton } from "@clerk/nextjs";

export function DashboardSignOutButton() {
	return (
		<SignOutButton>
			<button
				type="button"
				className="border border-border px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
			>
				Log out
			</button>
		</SignOutButton>
	);
}
