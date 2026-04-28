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

function isExpiredBackendRecord(
	key: string,
	value: unknown,
	nowMs: number,
): boolean {
	if (!value || typeof value !== "object") {
		return false;
	}
	const record = value as Record<string, unknown>;
	if (key.startsWith("cli-device-sessions/")) {
		const expiresAtMs = Date.parse(String(record.expiresAtISO ?? ""));
		return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
	}
	if (key.startsWith("cli-login-tokens/")) {
		return (
			typeof record.expiresAtMs === "number" && record.expiresAtMs <= nowMs
		);
	}
	if (key.startsWith("rate-limit-windows/")) {
		if (typeof record.expiresAtMs === "number") {
			return record.expiresAtMs <= nowMs;
		}
		return (
			typeof record.updatedAtMs === "number" &&
			record.updatedAtMs <= nowMs - 24 * 60 * 60 * 1000
		);
	}
	return false;
}

export const storageSummary = query({
	args: { token: v.string() },
	handler: async (ctx, args) => {
		assertBackendSecret(args.token);
		const files = await ctx.db.system.query("_storage").collect();
		const releaseFiles = await ctx.db.query("releaseFiles").collect();
		const referenced = new Set(releaseFiles.map((file) => file.storageId));
		const orphanedFiles = files.filter((file) => !referenced.has(file._id));
		return {
			total: files.length,
			referenced: files.length - orphanedFiles.length,
			orphaned: orphanedFiles.length,
			totalBytes: files.reduce((sum, file) => sum + (file.size ?? 0), 0),
			orphanedBytes: orphanedFiles.reduce(
				(sum, file) => sum + (file.size ?? 0),
				0,
			),
		};
	},
});

export const deleteOrphanedStorage = mutation({
	args: {
		token: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		assertBackendSecret(args.token);
		const files = await ctx.db.system.query("_storage").collect();
		const releaseFiles = await ctx.db.query("releaseFiles").collect();
		const referenced = new Set(releaseFiles.map((file) => file.storageId));
		const orphanedFiles = files
			.filter((file) => !referenced.has(file._id))
			.slice(0, args.limit ?? 50);
		for (const file of orphanedFiles) {
			await ctx.storage.delete(file._id);
		}
		return {
			deleted: orphanedFiles.length,
			deletedBytes: orphanedFiles.reduce(
				(sum, file) => sum + (file.size ?? 0),
				0,
			),
		};
	},
});

export const deleteExpiredWebsiteBackendRecords = mutation({
	args: {
		token: v.string(),
		nowMs: v.number(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		assertBackendSecret(args.token);
		const records = await ctx.db.query("websiteBackendRecords").collect();
		const expired = records
			.filter((record) =>
				isExpiredBackendRecord(record.key, record.value, args.nowMs),
			)
			.slice(0, args.limit ?? 100);
		for (const record of expired) {
			await ctx.db.delete(record._id);
		}
		return { deleted: expired.length };
	},
});
