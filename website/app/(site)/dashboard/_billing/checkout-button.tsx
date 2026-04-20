"use client";

import { useAuth } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { TransitionLink } from "@/components/transition-link";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ClerkPlanPeriod } from "@/lib/clerk-billing";
import { resolveCheckoutRenderState } from "./billing-cta-state";
import CheckoutAction from "./checkout-action";

type CheckoutButtonProps = {
	clerkEnabled: boolean;
	clerkPlanId: string | null;
	planPeriod: ClerkPlanPeriod;
	label: ReactNode;
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
			<p className="font-reading-body mt-2 text-muted-foreground">
				Billing is unavailable. Clerk auth is not configured.
			</p>
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
	label: ReactNode;
	className: string;
}) {
	const { isLoaded, isSignedIn } = useAuth();
	const isHydrated = useHydrated();
	const resolvedPlanId = planId ?? "";
	const renderState = resolveCheckoutRenderState({
		isHydrated,
		isLoaded: isLoaded ?? false,
		isSignedIn: isSignedIn ?? false,
		isUnavailable,
	});
	return (
		<div className="py-8">
			{renderState === "disabled_unavailable" ? (
				<Button variant="ghost" className={className} disabled>
					{label}
				</Button>
			) : null}
			{renderState === "sign_in" ? (
				<Button asChild className={className}>
					<TransitionLink href="/sign-in">{label}</TransitionLink>
				</Button>
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
