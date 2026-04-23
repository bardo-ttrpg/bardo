"use client";

import { SubscriptionDetailsButton } from "@clerk/nextjs/experimental";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function SubscriptionDetailsAction({
	className,
	label = "Manage Subscription",
	slotClassName,
}: {
	className: string;
	label?: ReactNode;
	slotClassName?: string;
}) {
	return (
		<div className={cn("py-8", slotClassName)}>
			<SubscriptionDetailsButton>
				<Button type="button" className={className}>
					{label}
				</Button>
			</SubscriptionDetailsButton>
		</div>
	);
}
