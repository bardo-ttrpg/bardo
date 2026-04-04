"use client";

import { SubscriptionDetailsButton } from "@clerk/nextjs/experimental";
import type { ReactNode } from "react";

export default function SubscriptionDetailsAction({
	className,
	label = "Manage Subscription",
}: {
	className: string;
	label?: ReactNode;
}) {
	return (
		<SubscriptionDetailsButton>
			<button type="button" className={className}>
				{label}
			</button>
		</SubscriptionDetailsButton>
	);
}
