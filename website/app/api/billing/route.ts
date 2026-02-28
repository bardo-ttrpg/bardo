import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
	dailyKeyVerificationLimitForPlan,
	dailyUserVerificationLimitForPlan,
	maxApiKeysForPlan,
	mcpPeriodLimitForPlan,
} from "@/lib/api-keys";
import { fetchLiveBillingSnapshotFromClerk } from "@/lib/clerk-live-billing";
import { createMcpUsageReader } from "@/lib/mcp-usage";
import { planCreditsFor } from "@/lib/user-billing";

export const runtime = "nodejs";

// ─── GET /api/billing ─────────────────────────────────────────────────────────
// Returns billing state derived live from Clerk billing APIs.

export async function GET() {
	const { userId } = await auth();
	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const clerk = await clerkClient();
	const live = await fetchLiveBillingSnapshotFromClerk(clerk, userId);
	if (live.billingUnavailable) {
		return NextResponse.json(
			{ error: "Billing service unavailable, please try again" },
			{ status: 503 },
		);
	}
	const creditsTotal = planCreditsFor(live.plan);
	const usageReader = createMcpUsageReader();
	const usage = await usageReader.readUserUsage({
		subjectId: userId,
		periodStartMs: live.periodStart,
	});

	const billing = {
		plan: live.plan,
		creditsTotal,
		creditsUsed: 0,
		periodStart: live.periodStart,
		mcpCallsTotal: usage.total,
		mcpCallsThisPeriod: usage.thisPeriod,
		apiKeyCallsTotal: 0,
		apiKeyCallsThisPeriod: 0,
		subscriptionStatus: live.subscriptionStatus,
		subscriptionId: live.subscriptionId,
		billingInterval: live.billingInterval,
		currentPeriodEnd: live.currentPeriodEnd,
		cancelAtPeriodEnd: live.cancelAtPeriodEnd,
	};

	const maxAllowed = maxApiKeysForPlan(live.plan);
	const dailyUserVerificationLimit = dailyUserVerificationLimitForPlan(
		live.plan,
	);
	const dailyKeyVerificationLimit = dailyKeyVerificationLimitForPlan(live.plan);
	const mcpPeriodLimit = mcpPeriodLimitForPlan(live.plan);

	return NextResponse.json({
		billing,
		keyPolicy: {
			maxAllowed,
			dailyUserVerificationLimit,
			dailyKeyVerificationLimit,
			mcpPeriodLimit,
		},
	});
}
