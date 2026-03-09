import Link from "next/link";
import type { ClerkPlanPeriod } from "@/lib/clerk-billing";
import CheckoutAction from "./checkout-action";

type CheckoutButtonProps = {
	clerkEnabled: boolean;
	clerkPlanId: string | null;
	planPeriod: ClerkPlanPeriod;
	label: string;
	className: string;
	isSignedIn?: boolean;
};

export default function CheckoutButton({
	clerkEnabled,
	clerkPlanId,
	planPeriod,
	label,
	className,
	isSignedIn = false,
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
			{isSignedIn ? (
				isUnavailable ? (
					<button type="button" className={className} disabled>
						{label}
					</button>
				) : (
					<CheckoutAction
						planId={planId}
						planPeriod={planPeriod}
						label={label}
						className={className}
					/>
				)
			) : (
				<Link href="/sign-in" prefetch={false} className={className}>
					{label}
				</Link>
			)}
			{isUnavailable ? (
				<p className="mt-2 text-xs text-red-500/80">
					Billing is unavailable. Missing Clerk plan configuration.
				</p>
			) : null}
		</div>
	);
}
