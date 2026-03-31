"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import { resolveSubscriptionDetailsRenderState } from "./billing-cta-state";
import SubscriptionDetailsAction from "./subscription-details-action";

export default function SubscriptionDetailsCta({
	clerkEnabled,
}: {
	clerkEnabled: boolean;
}) {
	const className =
		"ui-button inline-flex border border-border px-4 py-2 text-muted-foreground transition-colors hover:bg-subtle";

	if (!clerkEnabled) {
		return (
			<div className="mt-4 flex justify-center">
				<span className={className}>Billing unavailable</span>
			</div>
		);
	}

	return <EnabledSubscriptionDetailsCta className={className} />;
}

function EnabledSubscriptionDetailsCta({ className }: { className: string }) {
	const { isLoaded, isSignedIn } = useAuth();
	const [isHydrated, setIsHydrated] = useState(false);
	const renderState = resolveSubscriptionDetailsRenderState({
		isHydrated,
		isLoaded: isLoaded ?? false,
		isSignedIn: isSignedIn ?? false,
	});

	useEffect(() => {
		setIsHydrated(true);
	}, []);

	return (
		<div className="mt-4 flex justify-center">
			{renderState === "sign_in" ? (
				<Link href="/sign-in" className={className}>
					Sign In to Manage Billing
				</Link>
			) : null}
			{renderState === "manage" ? (
				<SubscriptionDetailsAction className={className} />
			) : null}
		</div>
	);
}
