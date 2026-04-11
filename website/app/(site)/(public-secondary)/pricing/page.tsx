import { createPublicMetadata } from "@/lib/site-metadata";
import { BardoViewTransition } from "@/components/view-transition";
import { readPricingBillingForCurrentUser } from "@/lib/billing-view-data";
import { PublicPageShell } from "../../_components/site-shells";
import { resolveBillingClerkConfig } from "../../dashboard/_billing/billing-clerk-config";
import { PricingClient } from "./pricing-client";

export const metadata = createPublicMetadata({
	title: "Pricing",
	description:
		"One Bardo subscription with monthly or yearly billing, local campaign files, and hosted account access for bridge approvals and usage.",
	path: "/pricing",
});

const billingConfig = resolveBillingClerkConfig({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

export default async function PricingPage() {
	const initialBilling = await readPricingBillingForCurrentUser("/pricing");

	return (
		<PublicPageShell className="max-w-5xl pb-10 pt-8 sm:pb-12 sm:pt-8 lg:pb-16 lg:pt-10">
			<BardoViewTransition name="bardo-page-region">
				<PricingClient
					clerkEnabled={billingConfig.clerkEnabled}
					clerkPlanId={billingConfig.clerkPlanIds.solo}
					initialBilling={initialBilling}
				/>
			</BardoViewTransition>
		</PublicPageShell>
	);
}
