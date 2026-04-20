import { BardoViewTransition } from "@/components/view-transition";
import { readPricingBillingForCurrentUser } from "@/lib/billing-view-data";
import { createPublicMetadata } from "@/lib/site-metadata";
import { getPricingPageJsonLd, pricingSeo } from "@/lib/site-seo";
import { PublicPageShell } from "../../_components/site-shells";
import { resolveBillingClerkConfig } from "../../dashboard/_billing/billing-clerk-config";
import { PricingClient } from "./pricing-client";

export const metadata = createPublicMetadata({
	title: pricingSeo.title,
	description: pricingSeo.description,
	socialDescription: pricingSeo.socialDescription,
	path: "/pricing",
	keywords: pricingSeo.keywords,
});

const billingConfig = resolveBillingClerkConfig({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

export default async function PricingPage() {
	const initialBilling = await readPricingBillingForCurrentUser("/pricing");
	const pricingPageJsonLd = JSON.stringify(getPricingPageJsonLd());

	return (
		<PublicPageShell className="max-w-5xl pb-10 pt-8 sm:pb-12 sm:pt-8 lg:pb-16 lg:pt-10">
			<script type="application/ld+json">{pricingPageJsonLd}</script>
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
