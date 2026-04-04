"use client";

import { CheckoutButton as ClerkCheckoutButton } from "@clerk/nextjs/experimental";
import type { ReactNode } from "react";
import type { ClerkPlanPeriod } from "@/lib/clerk-billing";

type CheckoutActionProps = {
	planId: string;
	planPeriod: ClerkPlanPeriod;
	label: ReactNode;
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
			newSubscriptionRedirectUrl="/dashboard?checkout=success"
		>
			<button type="button" className={className}>
				{label}
			</button>
		</ClerkCheckoutButton>
	);
}
