"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ClerkPlanPeriod } from "@/lib/clerk-billing";
import { resolveCheckoutRenderState } from "./billing-cta-state";
import CheckoutAction from "./checkout-action";

type CheckoutButtonProps = {
	clerkEnabled: boolean;
	clerkPlanId: string | null;
	planPeriod: ClerkPlanPeriod;
	label: string;
	className: string;
};

export default function CheckoutButton({
	clerkEnabled,
	clerkPlanId,
	planPeriod,
	label,
	className,
}: CheckoutButtonProps) {
	const planId = clerkPlanId ?? undefined;
	const isUnavailable = !planId;

	if (!clerkEnabled) {
		return (
			<div>
				<button type="button" className={className} disabled>
					{label}
				</button>
				<p className="font-reading-body mt-2 text-muted-foreground">
					Billing is unavailable. Clerk auth is not configured.
				</p>
			</div>
		);
	}

	return (
		<EnabledCheckoutButton
			isUnavailable={isUnavailable}
			planId={planId}
			planPeriod={planPeriod}
			label={label}
			className={className}
		/>
	);
}

function EnabledCheckoutButton({
	isUnavailable,
	planId,
	planPeriod,
	label,
	className,
}: {
	isUnavailable: boolean;
	planId: string | undefined;
	planPeriod: ClerkPlanPeriod;
	label: string;
	className: string;
}) {
	const { isLoaded, isSignedIn } = useAuth();
	const [isHydrated, setIsHydrated] = useState(false);
	const resolvedPlanId = planId ?? "";
	const renderState = resolveCheckoutRenderState({
		isHydrated,
		isLoaded: isLoaded ?? false,
		isSignedIn: isSignedIn ?? false,
		isUnavailable,
	});

	useEffect(() => {
		setIsHydrated(true);
	}, []);

	return (
		<div>
			{renderState === "sign_in" ? (
				<Link href="/sign-in" className={className}>
					{label}
				</Link>
			) : null}
			{renderState === "disabled_unavailable" ? (
				<button type="button" className={className} disabled>
					{label}
				</button>
			) : null}
			{renderState === "checkout" ? (
				<CheckoutAction
					planId={resolvedPlanId}
					planPeriod={planPeriod}
					label={label}
					className={className}
				/>
			) : null}
			{renderState === "disabled_unavailable" ? (
				<p className="font-reading-body mt-2 text-muted-foreground">
					Billing is unavailable. Missing Clerk plan configuration.
				</p>
			) : null}
		</div>
	);
}
