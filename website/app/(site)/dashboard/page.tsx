import { createPrivateMetadata } from "@/lib/site-metadata";
import { readDashboardViewDataForCurrentUser } from "@/lib/billing-view-data";
import { resolveBillingClerkConfig } from "./_billing/billing-clerk-config";
import { DashboardClient } from "./dashboard-client";

export const metadata = createPrivateMetadata("Dashboard");

export default async function DashboardPage() {
	const billingConfig = resolveBillingClerkConfig({
		publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
		secretKey: process.env.CLERK_SECRET_KEY,
	});
	const dashboardData = await readDashboardViewDataForCurrentUser("/dashboard");

	return (
		<DashboardClient
			clerkEnabled={billingConfig.clerkEnabled}
			clerkPlanId={billingConfig.clerkPlanIds.solo}
			initialDashboardData={dashboardData}
		/>
	);
}
