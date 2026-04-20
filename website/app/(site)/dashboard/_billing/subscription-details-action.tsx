"use client";

import { SubscriptionDetailsButton } from "@clerk/nextjs/experimental";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export default function SubscriptionDetailsAction({
	className,
	label = "Manage Subscription",
}: {
	className: string;
	label?: ReactNode;
}) {
	return (
		<SubscriptionDetailsButton>
			<Button type="button" className={className}>
				{label}
			</Button>
		</SubscriptionDetailsButton>
	);
}
