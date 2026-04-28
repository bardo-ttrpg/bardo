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

export const generateUploadUrl = mutation({
	args: { token: v.string() },
	handler: async (ctx, args) => {
		assertBackendSecret(args.token);
		return await ctx.storage.generateUploadUrl();
	},
});

export const saveReleaseFile = mutation({
	args: {
		path: v.string(),
		storageId: v.id("_storage"),
		size: v.number(),
		sha256: v.optional(v.string()),
		contentType: v.string(),
		token: v.string(),
	},
	handler: async (ctx, args) => {
		assertBackendSecret(args.token);
		const normalizedPath = args.path.replace(/^\/+/, "");
		const existing = await ctx.db
			.query("releaseFiles")
			.withIndex("by_path", (q) => q.eq("path", normalizedPath))
			.unique();
		const next = {
			path: normalizedPath,
			storageId: args.storageId,
			size: args.size,
			sha256: args.sha256,
			contentType: args.contentType,
			updatedAtMs: Date.now(),
		};
		if (existing) {
			if (existing.storageId !== args.storageId) {
				await ctx.storage.delete(existing.storageId);
			}
			await ctx.db.patch(existing._id, next);
			return;
		}
		await ctx.db.insert("releaseFiles", next);
	},
});

export const getReleaseFile = query({
	args: { path: v.string() },
	handler: async (ctx, args) => {
		const normalizedPath = args.path.replace(/^\/+/, "");
		const record = await ctx.db
			.query("releaseFiles")
			.withIndex("by_path", (q) => q.eq("path", normalizedPath))
			.unique();
		if (!record) {
			return null;
		}
		const url = await ctx.storage.getUrl(record.storageId);
		if (!url) {
			return null;
		}
		return {
			path: record.path,
			url,
			size: record.size,
			sha256: record.sha256,
			contentType: record.contentType,
			updatedAtMs: record.updatedAtMs,
		};
	},
});
