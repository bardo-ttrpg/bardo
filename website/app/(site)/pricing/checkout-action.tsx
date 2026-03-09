"use client";

import { CheckoutButton as ClerkCheckoutButton } from "@clerk/nextjs/experimental";
import type { ClerkPlanPeriod } from "@/lib/clerk-billing";

type CheckoutActionProps = {
	planId: string;
	planPeriod: ClerkPlanPeriod;
	label: string;
	className: string;
};

export default function CheckoutAction({
	planId,
	planPeriod,
	label,
	className,
}: CheckoutActionProps) {
	return (
		<ClerkCheckoutButton
			planId={planId}
			planPeriod={planPeriod}
			newSubscriptionRedirectUrl="/pricing?checkout=success"
		>
			<button type="button" className={className}>
				{label}
			</button>
		</ClerkCheckoutButton>
	);
}
