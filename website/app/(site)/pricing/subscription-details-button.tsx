import Link from "next/link";
import SubscriptionDetailsAction from "./subscription-details-action";

export default function SubscriptionDetailsCta({
	clerkEnabled,
	isSignedIn = false,
}: {
	clerkEnabled: boolean;
	isSignedIn?: boolean;
}) {
	const className =
		"inline-flex border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground";

	if (!clerkEnabled) {
		return (
			<div className="mt-4 flex justify-center">
				<span className={className}>Billing unavailable</span>
			</div>
		);
	}

	return (
		<div className="mt-4 flex justify-center">
			{isSignedIn ? (
				<SubscriptionDetailsAction className={className} />
			) : (
				<Link href="/sign-in" prefetch={false} className={className}>
					Sign In to Manage Billing
				</Link>
			)}
		</div>
	);
}
