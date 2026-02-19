import { v } from "convex/values";
import {
	buildBillingBackfillPatch,
	planCreditsFor,
	resolveBillingState,
} from "../lib/user-billing";
import { mutation, query } from "./_generated/server";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const upsertUser = mutation({
	args: {
		clerkId: v.string(),
		email: v.union(v.string(), v.null()),
		imageUrl: v.union(v.string(), v.null()),
		name: v.union(v.string(), v.null()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
			.unique();

		const now = Date.now();

		if (existing) {
			const backfillPatch = buildBillingBackfillPatch(
				{
					plan: existing.plan,
					creditsTotal: existing.creditsTotal,
					creditsUsed: existing.creditsUsed,
					periodStart: existing.periodStart,
					mcpCallsTotal: existing.mcpCallsTotal,
					mcpCallsThisPeriod: existing.mcpCallsThisPeriod,
				},
				now,
			);

			await ctx.db.patch(existing._id, {
				email: args.email,
				imageUrl: args.imageUrl,
				name: args.name,
				updatedAt: now,
				...backfillPatch,
			});
			return existing._id;
		}

		const initialBilling = resolveBillingState(
			{
				plan: "free",
				creditsTotal: undefined,
				creditsUsed: undefined,
				periodStart: undefined,
				mcpCallsTotal: undefined,
				mcpCallsThisPeriod: undefined,
			},
			now,
		);

		return await ctx.db.insert("users", {
			clerkId: args.clerkId,
			email: args.email,
			imageUrl: args.imageUrl,
			name: args.name,
			createdAt: now,
			updatedAt: now,
			plan: initialBilling.plan,
			creditsTotal: initialBilling.creditsTotal,
			creditsUsed: initialBilling.creditsUsed,
			periodStart: initialBilling.periodStart,
			mcpCallsTotal: initialBilling.mcpCallsTotal,
			mcpCallsThisPeriod: initialBilling.mcpCallsThisPeriod,
		});
	},
});

export const trackMcpCall = mutation({
	args: {
		clerkId: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
			.unique();

		if (!user) return null;

		const now = Date.now();
		const billing = resolveBillingState(
			{
				plan: user.plan,
				creditsTotal: user.creditsTotal,
				creditsUsed: user.creditsUsed,
				periodStart: user.periodStart,
				mcpCallsTotal: user.mcpCallsTotal,
				mcpCallsThisPeriod: user.mcpCallsThisPeriod,
			},
			now,
		);
		const backfillPatch = buildBillingBackfillPatch(
			{
				plan: user.plan,
				creditsTotal: user.creditsTotal,
				creditsUsed: user.creditsUsed,
				periodStart: user.periodStart,
				mcpCallsTotal: user.mcpCallsTotal,
				mcpCallsThisPeriod: user.mcpCallsThisPeriod,
			},
			now,
		);
		const periodExpired = now > billing.periodStart + THIRTY_DAYS_MS;

		if (periodExpired) {
			await ctx.db.patch(user._id, {
				...backfillPatch,
				creditsUsed: 1,
				mcpCallsThisPeriod: 1,
				mcpCallsTotal: billing.mcpCallsTotal + 1,
				periodStart: now,
				creditsTotal: planCreditsFor(billing.plan),
			});
		} else {
			await ctx.db.patch(user._id, {
				...backfillPatch,
				creditsUsed: billing.creditsUsed + 1,
				mcpCallsThisPeriod: billing.mcpCallsThisPeriod + 1,
				mcpCallsTotal: billing.mcpCallsTotal + 1,
			});
		}

		return user._id;
	},
});

export const getUserByClerkId = query({
	args: { clerkId: v.string() },
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
			.unique();

		if (!user) return null;

		return {
			...user,
			...resolveBillingState({
				plan: user.plan,
				creditsTotal: user.creditsTotal,
				creditsUsed: user.creditsUsed,
				periodStart: user.periodStart,
				mcpCallsTotal: user.mcpCallsTotal,
				mcpCallsThisPeriod: user.mcpCallsThisPeriod,
			}),
		};
	},
});
