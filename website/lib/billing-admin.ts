import { clerkClient } from "@clerk/nextjs/server";
import {
	createClerkBillingReader,
	fetchLiveBillingSnapshotFromClerk,
} from "./clerk-live-billing";
import { planCreditsFor } from "./user-billing";

export type PlanTier = "free" | "pro";
export type SubscriptionStatus =
	| "incomplete"
	| "incomplete_expired"
	| "trialing"
	| "active"
	| "past_due"
	| "canceled"
	| "unpaid"
	| "paused";
export type BillingInterval = "month" | "year" | null;

export type BillingSnapshot = {
	billingUnavailable: boolean;
	plan: PlanTier;
	creditsTotal: number;
	creditsUsed: number;
	creditsRemaining: number;
	periodStart: number;
	mcpCallsTotal: number;
	mcpCallsThisPeriod: number;
	subscriptionStatus: SubscriptionStatus;
	subscriptionId: string | null;
	billingInterval: BillingInterval;
	currentPeriodEnd: number | null;
	cancelAtPeriodEnd: boolean;
};

export function createBillingAdminClient(
	env: Record<string, string | undefined> = process.env,
) {
	return {
		async readBillingSnapshot(clerkUserId: string): Promise<BillingSnapshot> {
			const clerk = (await clerkClient()) as {
				billing?: {
					getUserBillingSubscription?: (userId: string) => Promise<unknown>;
				};
			};
			const readSubscription = createClerkBillingReader(clerk);

			if (!readSubscription) {
				const creditsTotal = planCreditsFor("free");
				return {
					billingUnavailable: true,
					plan: "free",
					creditsTotal,
					creditsUsed: 0,
					creditsRemaining: creditsTotal,
					periodStart: Date.now(),
					mcpCallsTotal: 0,
					mcpCallsThisPeriod: 0,
					subscriptionStatus: "canceled",
					subscriptionId: null,
					billingInterval: null,
					currentPeriodEnd: null,
					cancelAtPeriodEnd: false,
				};
			}

			const live = await fetchLiveBillingSnapshotFromClerk(
				{
					billing: {
						getUserBillingSubscription: async (userId: string) =>
							(await readSubscription(userId)) as Record<string, unknown>,
					},
				},
				clerkUserId,
				env,
			);
			const creditsTotal = planCreditsFor(live.plan);

			return {
				billingUnavailable: live.billingUnavailable,
				plan: live.plan,
				creditsTotal,
				creditsUsed: 0,
				creditsRemaining: creditsTotal,
				periodStart: live.periodStart,
				mcpCallsTotal: 0,
				mcpCallsThisPeriod: 0,
				subscriptionStatus: live.subscriptionStatus,
				subscriptionId: live.subscriptionId,
				billingInterval: live.billingInterval,
				currentPeriodEnd: live.currentPeriodEnd,
				cancelAtPeriodEnd: live.cancelAtPeriodEnd,
			};
		},
	};
}
