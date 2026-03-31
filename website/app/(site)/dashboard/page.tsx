import { createPrivateMetadata } from "@/lib/site-metadata";
import { resolveBillingClerkConfig } from "./_billing/billing-clerk-config";
import { DashboardClient } from "./dashboard-client";

export const metadata = createPrivateMetadata("Dashboard");

export default async function DashboardPage() {
	const billingConfig = resolveBillingClerkConfig({
		publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
		secretKey: process.env.CLERK_SECRET_KEY,
	});

	return (
		<DashboardClient
			clerkEnabled={billingConfig.clerkEnabled}
			clerkPlanId={billingConfig.clerkPlanIds.solo}
		/>
	);
}
