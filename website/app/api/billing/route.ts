import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { maxApiKeysForPlan } from "@/lib/api-keys";
import { fetchLiveBillingSnapshotFromClerk } from "@/lib/clerk-live-billing";
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
	const creditsTotal = planCreditsFor(live.plan, live.partySeats);

	const billing = {
		plan: live.plan,
		creditsTotal,
		creditsUsed: 0,
		periodStart: live.periodStart,
		mcpCallsTotal: 0,
		mcpCallsThisPeriod: 0,
		apiKeyCallsTotal: 0,
		apiKeyCallsThisPeriod: 0,
		partySeats: live.partySeats,
		subscriptionStatus: live.subscriptionStatus,
		subscriptionId: live.subscriptionId,
		billingInterval: live.billingInterval,
		currentPeriodEnd: live.currentPeriodEnd,
		cancelAtPeriodEnd: live.cancelAtPeriodEnd,
	};

	const maxAllowed = maxApiKeysForPlan(live.plan);

	return NextResponse.json({ billing, keyPolicy: { maxAllowed } });
}
