import { v } from "convex/values";
import {
	type BillingInterval,
	resolveBillingState,
	type SubscriptionStatus,
} from "../../lib/user-billing";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const PLAN_TIER_VALIDATOR = v.union(
	v.literal("free"),
	v.literal("solo"),
	v.literal("solo_plus"),
	v.literal("party"),
);

export const BILLING_INTERVAL_VALIDATOR = v.union(
	v.literal("month"),
	v.literal("year"),
);

export const SUBSCRIPTION_STATUS_VALIDATOR = v.union(
	v.literal("incomplete"),
	v.literal("incomplete_expired"),
	v.literal("trialing"),
	v.literal("active"),
	v.literal("past_due"),
	v.literal("canceled"),
	v.literal("unpaid"),
	v.literal("paused"),
);

export type UsersReadCtx = QueryCtx | MutationCtx;
export type UserDoc = Doc<"users">;

export type UpsertUserArgs = {
	clerkId: string;
	email: string | null;
	imageUrl: string | null;
	name: string | null;
};

export type TrackMcpCallArgs = {
	clerkId: string;
};

export type SetStripeCustomerIdArgs = {
	clerkId: string;
	stripeCustomerId: string;
};

export type ApplyStripeSubscriptionArgs = {
	clerkId?: string;
	stripeCustomerId: string;
	stripeSubscriptionId: string | null;
	stripePriceId: string | null;
	subscriptionStatus: SubscriptionStatus;
	billingInterval: BillingInterval | null;
	plan?: "free" | "solo" | "solo_plus" | "party";
	partySeats?: number;
	currentPeriodEnd: number | null;
	cancelAtPeriodEnd: boolean;
	periodStart: number | null;
	now: number;
};

export type DowngradeToFreeArgs = {
	stripeCustomerId: string;
	now: number;
};

export type RecordInvoicePaymentArgs = {
	clerkId: string;
	stripeCustomerId: string;
	stripeSubscriptionId: string | null;
	stripeInvoiceId: string;
	amountPaidCents: number;
	currency: string;
	paidAt: number;
	status: string;
	billingReason: string | null;
	priceId: string | null;
	billingInterval: BillingInterval | null;
	partySeats: number;
	now: number;
};

export type ReserveBillingEventArgs = {
	stripeEventId: string;
	type: string;
	createdAt: number;
	receivedAt: number;
};

export type CompleteBillingEventArgs = {
	stripeEventId: string;
	status: "processed" | "failed" | "ignored";
	error?: string;
	processedAt: number;
};

export function billingFieldsFromUser(user: {
	plan?: "free" | "solo" | "solo_plus" | "party" | "pro" | "ultra";
	creditsTotal?: number;
	creditsUsed?: number;
	periodStart?: number;
	mcpCallsTotal?: number;
	mcpCallsThisPeriod?: number;
	partySeats?: number;
}) {
	return {
		plan: user.plan,
		creditsTotal: user.creditsTotal,
		creditsUsed: user.creditsUsed,
		periodStart: user.periodStart,
		mcpCallsTotal: user.mcpCallsTotal,
		mcpCallsThisPeriod: user.mcpCallsThisPeriod,
		partySeats: user.partySeats,
	};
}

export async function findUserByClerkId(
	ctx: UsersReadCtx,
	clerkId: string,
): Promise<UserDoc | null> {
	return await ctx.db
		.query("users")
		.withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
		.unique();
}

export async function findUserByStripeCustomerId(
	ctx: UsersReadCtx,
	stripeCustomerId: string,
): Promise<UserDoc | null> {
	return await ctx.db
		.query("users")
		.withIndex("by_stripe_customer_id", (q) =>
			q.eq("stripeCustomerId", stripeCustomerId),
		)
		.unique();
}

export function resolveUserBillingView(user: UserDoc) {
	return {
		...user,
		...resolveBillingState(billingFieldsFromUser(user)),
	};
}
