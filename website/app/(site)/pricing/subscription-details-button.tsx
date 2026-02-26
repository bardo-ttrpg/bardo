"use client";

import { SignedIn, SignedOut } from "@clerk/nextjs";
import { SubscriptionDetailsButton } from "@clerk/nextjs/experimental";
import Link from "next/link";

export default function SubscriptionDetailsCta({
	clerkEnabled,
}: {
	clerkEnabled: boolean;
}) {
	const className =
		"inline-flex border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground";

	if (!clerkEnabled) {
		return (
			<div className="mt-4 flex justify-center">
				<span className={className}>Billing unavailable</span>
			</div>
		);
	}

	return (
		<div className="mt-4 flex justify-center">
			<SignedIn>
				<SubscriptionDetailsButton>
					<button type="button" className={className}>
						Manage Subscription
					</button>
				</SubscriptionDetailsButton>
			</SignedIn>
			<SignedOut>
				<Link href="/sign-in" className={className}>
					Sign In to Manage Billing
				</Link>
			</SignedOut>
		</div>
	);
}
