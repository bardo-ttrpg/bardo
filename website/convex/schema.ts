import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	users: defineTable({
		// Identity (from Clerk)
		clerkId: v.string(),
		email: v.union(v.string(), v.null()),
		imageUrl: v.union(v.string(), v.null()),
		name: v.union(v.string(), v.null()),
		createdAt: v.number(),
		updatedAt: v.number(),
		// Billing fields are optional for legacy rows and are backfilled on write/read.
		plan: v.optional(
			v.union(
				v.literal("free"),
				v.literal("solo"),
				v.literal("solo_plus"),
				v.literal("party"),
				// Legacy values are still accepted for seamless migration.
				v.literal("pro"),
				v.literal("ultra"),
			),
		),
		creditsTotal: v.optional(v.number()), // quota for current period
		creditsUsed: v.optional(v.number()), // used so far this period
		periodStart: v.optional(v.number()), // Unix ms when period began
		mcpCallsTotal: v.optional(v.number()), // lifetime total
		mcpCallsThisPeriod: v.optional(v.number()), // resets with period
		partySeats: v.optional(v.number()),
		stripeCustomerId: v.optional(v.string()),
		stripeSubscriptionId: v.optional(v.string()),
		stripePriceId: v.optional(v.string()),
		billingInterval: v.optional(v.union(v.literal("month"), v.literal("year"))),
		subscriptionStatus: v.optional(
			v.union(
				v.literal("incomplete"),
				v.literal("incomplete_expired"),
				v.literal("trialing"),
				v.literal("active"),
				v.literal("past_due"),
				v.literal("canceled"),
				v.literal("unpaid"),
				v.literal("paused"),
			),
		),
		currentPeriodEnd: v.optional(v.number()),
		cancelAtPeriodEnd: v.optional(v.boolean()),
		lastInvoiceId: v.optional(v.string()),
		lastPaymentAt: v.optional(v.number()),
	})
		.index("by_clerk_id", ["clerkId"])
		.index("by_email", ["email"])
		.index("by_stripe_customer_id", ["stripeCustomerId"])
		.index("by_stripe_subscription_id", ["stripeSubscriptionId"]),
	payments: defineTable({
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
		billingInterval: v.union(v.literal("month"), v.literal("year"), v.null()),
		partySeats: v.number(),
		createdAt: v.number(),
	})
		.index("by_stripe_invoice_id", ["stripeInvoiceId"])
		.index("by_clerk_id", ["clerkId"])
		.index("by_stripe_customer_id", ["stripeCustomerId"]),
	billing_events: defineTable({
		stripeEventId: v.string(),
		type: v.string(),
		status: v.union(
			v.literal("processing"),
			v.literal("processed"),
			v.literal("failed"),
			v.literal("ignored"),
		),
		createdAt: v.number(),
		receivedAt: v.number(),
		processedAt: v.optional(v.number()),
		error: v.optional(v.string()),
	})
		.index("by_stripe_event_id", ["stripeEventId"])
		.index("by_status", ["status"]),
});
