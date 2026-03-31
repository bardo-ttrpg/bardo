"use client";

import { SignOutButton } from "@clerk/nextjs";

export function DashboardSignOutButton() {
	return (
		<SignOutButton>
			<button
				type="button"
				className="ui-button border border-border px-5 py-2.5 text-muted-foreground transition-colors hover:bg-subtle"
			>
				Log out
			</button>
		</SignOutButton>
	);
}
