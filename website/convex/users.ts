import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
	applyStripeSubscriptionHandler,
	completeBillingEventHandler,
	downgradeToFreeHandler,
	getUserByClerkIdHandler,
	getUserByStripeCustomerIdHandler,
	migrateLegacyPlanCatalogHandler,
	recordInvoicePaymentHandler,
	reserveBillingEventHandler,
	setStripeCustomerIdHandler,
	trackMcpCallHandler,
	upsertUserHandler,
} from "./users/handlers";
import {
	BILLING_INTERVAL_VALIDATOR,
	PLAN_TIER_VALIDATOR,
	SUBSCRIPTION_STATUS_VALIDATOR,
} from "./users/shared";

export const upsertUser = mutation({
	args: {
		clerkId: v.string(),
		email: v.union(v.string(), v.null()),
		imageUrl: v.union(v.string(), v.null()),
		name: v.union(v.string(), v.null()),
	},
	handler: upsertUserHandler,
});

export const trackMcpCall = mutation({
	args: {
		clerkId: v.string(),
	},
	handler: trackMcpCallHandler,
});

export const getUserByClerkId = query({
	args: { clerkId: v.string() },
	handler: (ctx, args) => getUserByClerkIdHandler(ctx, args.clerkId),
});

export const getUserByStripeCustomerId = query({
	args: { stripeCustomerId: v.string() },
	handler: (ctx, args) =>
		getUserByStripeCustomerIdHandler(ctx, args.stripeCustomerId),
});

export const setStripeCustomerId = mutation({
	args: {
		clerkId: v.string(),
		stripeCustomerId: v.string(),
	},
	handler: setStripeCustomerIdHandler,
});

export const applyStripeSubscription = mutation({
	args: {
		clerkId: v.optional(v.string()),
		stripeCustomerId: v.string(),
		stripeSubscriptionId: v.union(v.string(), v.null()),
		stripePriceId: v.union(v.string(), v.null()),
		subscriptionStatus: SUBSCRIPTION_STATUS_VALIDATOR,
		billingInterval: v.union(BILLING_INTERVAL_VALIDATOR, v.null()),
		plan: v.optional(PLAN_TIER_VALIDATOR),
		partySeats: v.optional(v.float64()),
		currentPeriodEnd: v.union(v.float64(), v.null()),
		cancelAtPeriodEnd: v.boolean(),
		periodStart: v.union(v.float64(), v.null()),
		now: v.float64(),
	},
	handler: applyStripeSubscriptionHandler,
});

export const downgradeToFree = mutation({
	args: {
		stripeCustomerId: v.string(),
		now: v.float64(),
	},
	handler: downgradeToFreeHandler,
});

export const migrateLegacyPlanCatalog = mutation({
	args: {},
	handler: migrateLegacyPlanCatalogHandler,
});

export const recordInvoicePayment = mutation({
	args: {
		clerkId: v.string(),
		stripeCustomerId: v.string(),
		stripeSubscriptionId: v.union(v.string(), v.null()),
		stripeInvoiceId: v.string(),
		amountPaidCents: v.float64(),
		currency: v.string(),
		paidAt: v.float64(),
		status: v.string(),
		billingReason: v.union(v.string(), v.null()),
		priceId: v.union(v.string(), v.null()),
		billingInterval: v.union(BILLING_INTERVAL_VALIDATOR, v.null()),
		partySeats: v.float64(),
		now: v.float64(),
	},
	handler: recordInvoicePaymentHandler,
});

export const reserveBillingEvent = mutation({
	args: {
		stripeEventId: v.string(),
		type: v.string(),
		createdAt: v.float64(),
		receivedAt: v.float64(),
	},
	handler: reserveBillingEventHandler,
});

export const completeBillingEvent = mutation({
	args: {
		stripeEventId: v.string(),
		status: v.union(
			v.literal("processed"),
			v.literal("failed"),
			v.literal("ignored"),
		),
		error: v.optional(v.string()),
		processedAt: v.float64(),
	},
	handler: completeBillingEventHandler,
});
