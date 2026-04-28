import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function assertBackendSecret(token: string) {
	if (!process.env.BARDO_CONVEX_BACKEND_SECRET) {
		throw new Error("BARDO_CONVEX_BACKEND_SECRET is not configured.");
	}
	if (token !== process.env.BARDO_CONVEX_BACKEND_SECRET) {
		throw new Error("Invalid Convex backend secret.");
	}
}

export const getRecord = query({
	args: { key: v.string(), token: v.string() },
	handler: async (ctx, args) => {
		assertBackendSecret(args.token);
		const record = await ctx.db
			.query("websiteBackendRecords")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.unique();
		return record?.value ?? null;
	},
});

export const putRecord = mutation({
	args: { key: v.string(), value: v.any(), token: v.string() },
	handler: async (ctx, args) => {
		assertBackendSecret(args.token);
		const existing = await ctx.db
			.query("websiteBackendRecords")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.unique();
		const next = {
			key: args.key,
			value: args.value,
			updatedAtMs: Date.now(),
		};
		if (existing) {
			await ctx.db.patch(existing._id, next);
			return;
		}
		await ctx.db.insert("websiteBackendRecords", next);
	},
});
