"use client";

import { SubscriptionDetailsButton } from "@clerk/nextjs/experimental";

export default function SubscriptionDetailsAction({
	className,
}: {
	className: string;
}) {
	return (
		<SubscriptionDetailsButton>
			<button type="button" className={className}>
				Manage Subscription
			</button>
		</SubscriptionDetailsButton>
	);
}
