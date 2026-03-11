import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
	dailyKeyVerificationLimitForPlan,
	dailyUserVerificationLimitForPlan,
	maxApiKeysForPlan,
	mcpPeriodLimitForPlan,
} from "@/lib/api-keys";
import { fetchLiveBillingSnapshotFromClerk } from "@/lib/clerk-live-billing";
import { resolveRouteUserId } from "@/lib/clerk-route-auth";
import { createMcpUsageReader } from "@/lib/mcp-usage";
import { planCreditsFor } from "@/lib/user-billing";

export const runtime = "nodejs";

type BillingRouteDeps = {
	resolveAuthState: typeof resolveRouteUserId;
	createClerkClient: typeof clerkClient;
	fetchLiveBilling: typeof fetchLiveBillingSnapshotFromClerk;
	readUserUsage: ReturnType<typeof createMcpUsageReader>["readUserUsage"];
};

const defaultDeps: BillingRouteDeps = {
	resolveAuthState: resolveRouteUserId,
	createClerkClient: clerkClient,
	fetchLiveBilling: fetchLiveBillingSnapshotFromClerk,
	readUserUsage: createMcpUsageReader().readUserUsage,
};

export function createBillingGetHandler(
	overrides: Partial<BillingRouteDeps> = {},
) {
	const deps = { ...defaultDeps, ...overrides };

	return async function GET() {
		const authState = await deps.resolveAuthState("/api/billing");
		if (authState.response) {
			return authState.response;
		}

		const { userId } = authState;
		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const clerk = await deps.createClerkClient();
		const live = await deps.fetchLiveBilling(clerk, userId);
		if (live.billingUnavailable) {
			return NextResponse.json(
				{ error: "Billing service unavailable, please try again" },
				{ status: 503 },
			);
		}
		const creditsTotal = planCreditsFor(live.plan);
		const usage = await deps.readUserUsage({
			subjectId: userId,
			periodStartMs: live.periodStart,
		});

		const billing = {
			plan: live.plan,
			creditsTotal,
			creditsUsed: usage.thisPeriod,
			creditsRemaining: Math.max(creditsTotal - usage.thisPeriod, 0),
			periodStart: live.periodStart,
			mcpCallsTotal: usage.total,
			mcpCallsThisPeriod: usage.thisPeriod,
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
		const dailyKeyVerificationLimit = dailyKeyVerificationLimitForPlan(
			live.plan,
		);
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
	};
}

// ─── GET /api/billing ─────────────────────────────────────────────────────────
// Returns billing state derived live from Clerk billing APIs.
export const GET = createBillingGetHandler();
