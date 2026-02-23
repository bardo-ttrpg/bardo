import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
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

const USER_ID_OR_NULL_RETURN_VALIDATOR = v.union(v.id("users"), v.null());

const BILLING_EVENT_STATUS_RETURN_VALIDATOR = v.union(
	v.literal("processing"),
	v.literal("processed"),
	v.literal("failed"),
	v.literal("ignored"),
);

const USER_BILLING_VIEW_RETURN_VALIDATOR = v.object({
	_id: v.id("users"),
	_creationTime: v.number(),
	clerkId: v.string(),
	email: v.union(v.string(), v.null()),
	imageUrl: v.union(v.string(), v.null()),
	name: v.union(v.string(), v.null()),
	createdAt: v.number(),
	updatedAt: v.number(),
	plan: PLAN_TIER_VALIDATOR,
	creditsTotal: v.number(),
	creditsUsed: v.number(),
	periodStart: v.number(),
	mcpCallsTotal: v.number(),
	mcpCallsThisPeriod: v.number(),
	partySeats: v.number(),
	stripeCustomerId: v.optional(v.string()),
	stripeSubscriptionId: v.optional(v.string()),
	stripePriceId: v.optional(v.string()),
	billingInterval: v.optional(BILLING_INTERVAL_VALIDATOR),
	subscriptionStatus: v.optional(SUBSCRIPTION_STATUS_VALIDATOR),
	currentPeriodEnd: v.optional(v.number()),
	cancelAtPeriodEnd: v.optional(v.boolean()),
	lastInvoiceId: v.optional(v.string()),
	lastPaymentAt: v.optional(v.number()),
});

const USER_BILLING_VIEW_OR_NULL_RETURN_VALIDATOR = v.union(
	USER_BILLING_VIEW_RETURN_VALIDATOR,
	v.null(),
);

export const upsertUser = mutation({
	args: {
		clerkId: v.string(),
		email: v.union(v.string(), v.null()),
		imageUrl: v.union(v.string(), v.null()),
		name: v.union(v.string(), v.null()),
	},
	returns: v.id("users"),
	handler: upsertUserHandler,
});

export const trackMcpCall = internalMutation({
	args: {
		clerkId: v.string(),
	},
	returns: USER_ID_OR_NULL_RETURN_VALIDATOR,
	handler: trackMcpCallHandler,
});

export const getUserByClerkId = internalQuery({
	args: { clerkId: v.string() },
	returns: USER_BILLING_VIEW_OR_NULL_RETURN_VALIDATOR,
	handler: (ctx, args) => getUserByClerkIdHandler(ctx, args.clerkId),
});

export const getUserByStripeCustomerId = internalQuery({
	args: { stripeCustomerId: v.string() },
	returns: USER_BILLING_VIEW_OR_NULL_RETURN_VALIDATOR,
	handler: (ctx, args) =>
		getUserByStripeCustomerIdHandler(ctx, args.stripeCustomerId),
});

export const setStripeCustomerId = internalMutation({
	args: {
		clerkId: v.string(),
		stripeCustomerId: v.string(),
	},
	returns: USER_ID_OR_NULL_RETURN_VALIDATOR,
	handler: setStripeCustomerIdHandler,
});

export const applyStripeSubscription = internalMutation({
	args: {
		clerkId: v.optional(v.string()),
		stripeCustomerId: v.string(),
		stripeSubscriptionId: v.union(v.string(), v.null()),
		stripePriceId: v.union(v.string(), v.null()),
		subscriptionStatus: SUBSCRIPTION_STATUS_VALIDATOR,
		billingInterval: v.union(BILLING_INTERVAL_VALIDATOR, v.null()),
		plan: v.optional(PLAN_TIER_VALIDATOR),
		partySeats: v.optional(v.number()),
		currentPeriodEnd: v.union(v.number(), v.null()),
		cancelAtPeriodEnd: v.boolean(),
		periodStart: v.union(v.number(), v.null()),
		now: v.number(),
	},
	returns: USER_ID_OR_NULL_RETURN_VALIDATOR,
	handler: applyStripeSubscriptionHandler,
});

export const downgradeToFree = internalMutation({
	args: {
		stripeCustomerId: v.string(),
		now: v.number(),
	},
	returns: USER_ID_OR_NULL_RETURN_VALIDATOR,
	handler: downgradeToFreeHandler,
});

export const migrateLegacyPlanCatalog = internalMutation({
	args: {},
	returns: v.object({
		scanned: v.number(),
		updated: v.number(),
	}),
	handler: migrateLegacyPlanCatalogHandler,
});

export const recordInvoicePayment = internalMutation({
	args: {
		clerkId: v.string(),
		stripeCustomerId: v.string(),
		stripeSubscriptionId: v.union(v.string(), v.null()),
		stripeInvoiceId: v.string(),
		amountPaidCents: v.number(),
		currency: v.string(),
		paidAt: v.number(),
		status: v.string(),
		billingReason: v.union(v.string(), v.null()),
		priceId: v.union(v.string(), v.null()),
		billingInterval: v.union(BILLING_INTERVAL_VALIDATOR, v.null()),
		partySeats: v.number(),
		now: v.number(),
	},
	returns: v.union(v.literal("deduplicated"), v.literal("inserted")),
	handler: recordInvoicePaymentHandler,
});

export const reserveBillingEvent = internalMutation({
	args: {
		stripeEventId: v.string(),
		type: v.string(),
		createdAt: v.number(),
		receivedAt: v.number(),
	},
	returns: v.object({
		accepted: v.boolean(),
		status: BILLING_EVENT_STATUS_RETURN_VALIDATOR,
	}),
	handler: reserveBillingEventHandler,
});

export const completeBillingEvent = internalMutation({
	args: {
		stripeEventId: v.string(),
		status: v.union(
			v.literal("processed"),
			v.literal("failed"),
			v.literal("ignored"),
		),
		error: v.optional(v.string()),
		processedAt: v.number(),
	},
	returns: v.union(v.id("billing_events"), v.null()),
	handler: completeBillingEventHandler,
});
