"use client";

import { useAuth } from "@clerk/nextjs";
import { usePlans } from "@clerk/nextjs/experimental";
import type { ReactNode } from "react";
import { TransitionLink } from "@/components/transition-link";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ClerkPlanPeriod } from "@/lib/clerk-billing";
import {
	resolveCheckoutPlanId,
	resolveCheckoutRenderState,
} from "./billing-cta-state";
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

	if (!clerkEnabled) {
		return (
			<p className="font-reading-body mt-2 text-muted-foreground">
				Billing is unavailable. Clerk auth is not configured.
			</p>
		);
	}

	return (
		<EnabledCheckoutButton
			planId={planId}
			planPeriod={planPeriod}
			label={label}
			className={className}
		/>
	);
}

function EnabledCheckoutButton({
	planId,
	planPeriod,
	label,
	className,
}: {
	planId: string | undefined;
	planPeriod: ClerkPlanPeriod;
	label: ReactNode;
	className: string;
}) {
	const { isLoaded, isSignedIn } = useAuth();
	const {
		data: plans,
		isFetching: isFetchingPlans,
		isLoading: isLoadingPlans,
	} = usePlans({ for: "user" });
	const isHydrated = useHydrated();
	const resolvedPlanId = resolveCheckoutPlanId({
		configuredPlanId: planId,
		plans,
	});
	const isResolvingPlan =
		isHydrated &&
		(isLoaded ?? false) &&
		(isSignedIn ?? false) &&
		!resolvedPlanId &&
		(isLoadingPlans || isFetchingPlans);
	const isUnavailable =
		isHydrated &&
		(isLoaded ?? false) &&
		(isSignedIn ?? false) &&
		!isResolvingPlan &&
		!resolvedPlanId;
	const renderState = resolveCheckoutRenderState({
		isHydrated,
		isLoaded: (isLoaded ?? false) && !isResolvingPlan,
		isSignedIn: isSignedIn ?? false,
		isUnavailable,
	});
	return (
		<div className="py-8">
			{isResolvingPlan ? (
				<>
					<Button variant="ghost" className={className} disabled>
						{label}
					</Button>
					<p className="font-reading-body mt-2 text-muted-foreground">
						Preparing secure checkout...
					</p>
				</>
			) : null}
			{!isResolvingPlan && renderState === "disabled_unavailable" ? (
				<Button variant="ghost" className={className} disabled>
					{label}
				</Button>
			) : null}
			{!isResolvingPlan && renderState === "sign_in" ? (
				<Button asChild className={className}>
					<TransitionLink href="/sign-in">{label}</TransitionLink>
				</Button>
			) : null}
			{!isResolvingPlan && renderState === "checkout" ? (
				<CheckoutAction
					planId={resolvedPlanId ?? ""}
					planPeriod={planPeriod}
					label={label}
					className={className}
				/>
			) : null}
			{!isResolvingPlan && renderState === "disabled_unavailable" ? (
				<p className="font-reading-body mt-2 text-muted-foreground">
					Billing is unavailable. Could not find the public Pro plan in Clerk
					Billing.
				</p>
			) : null}
		</div>
	);
}
