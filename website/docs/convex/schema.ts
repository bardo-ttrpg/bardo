import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	users: defineTable({
		// Identity (from Clerk)
		clerkId: v.string(),
		email: v.union(v.string(), v.null()),
		imageUrl: v.union(v.string(), v.null()),
		name: v.union(v.string(), v.null()),
		createdAt: v.float64(),
		updatedAt: v.float64(),
		// Billing fields are optional for legacy rows and are backfilled on write/read.
		plan: v.optional(
			v.union(v.literal("free"), v.literal("pro"), v.literal("ultra")),
		),
		creditsTotal: v.optional(v.float64()), // quota for current period
		creditsUsed: v.optional(v.float64()), // used so far this period
		periodStart: v.optional(v.float64()), // Unix ms when period began
		mcpCallsTotal: v.optional(v.float64()), // lifetime total
		mcpCallsThisPeriod: v.optional(v.float64()), // resets with period
	})
		.index("by_clerk_id", ["clerkId"])
		.index("by_email", ["email"]),
});
