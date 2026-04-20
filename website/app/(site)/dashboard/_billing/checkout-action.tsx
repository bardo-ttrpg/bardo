"use client";

import { CheckoutButton as ClerkCheckoutButton } from "@clerk/nextjs/experimental";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
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
			newSubscriptionRedirectUrl="/dashboard"
		>
			<Button variant="default" className={className}>
				{label}
			</Button>
		</ClerkCheckoutButton>
	);
}
