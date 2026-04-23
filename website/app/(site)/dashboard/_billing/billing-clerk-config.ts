import { getClerkPlanId } from "@/lib/clerk-billing";
import { isClerkAuthConfigured } from "@/lib/clerk-config";

export function resolveBillingClerkConfig({
	publishableKey,
	secretKey,
	env = process.env,
}: {
	publishableKey: string | null | undefined;
	secretKey: string | null | undefined;
	env?: Record<string, string | undefined>;
}) {
	return {
		clerkEnabled: isClerkAuthConfigured({
			publishableKey,
			secretKey,
		}),
		clerkPlanIds: {
			pro: getClerkPlanId("pro", env),
		},
	};
}
