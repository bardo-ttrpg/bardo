"use client";

import { SignedIn, SignedOut } from "@clerk/nextjs";
import { CheckoutButton as ClerkCheckoutButton } from "@clerk/nextjs/experimental";
import Link from "next/link";
import type { ClerkPlanPeriod } from "@/lib/clerk-billing";

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
				<p className="mt-2 text-xs text-red-500/80">
					Billing is unavailable. Clerk auth is not configured.
				</p>
			</div>
		);
	}

	return (
		<div>
			<SignedIn>
				{isUnavailable ? (
					<button type="button" className={className} disabled>
						{label}
					</button>
				) : (
					<ClerkCheckoutButton
						planId={planId}
						planPeriod={planPeriod}
						newSubscriptionRedirectUrl="/pricing?checkout=success"
					>
						<button type="button" className={className}>
							{label}
						</button>
					</ClerkCheckoutButton>
				)}
			</SignedIn>
			<SignedOut>
				<Link href="/sign-in" className={className}>
					{label}
				</Link>
			</SignedOut>
			{isUnavailable ? (
				<p className="mt-2 text-xs text-red-500/80">
					Billing is unavailable. Missing Clerk plan configuration.
				</p>
			) : null}
		</div>
	);
}
