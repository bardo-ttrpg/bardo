import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	websiteBackendRecords: defineTable({
		key: v.string(),
		value: v.any(),
		updatedAtMs: v.number(),
	}).index("by_key", ["key"]),
	releaseFiles: defineTable({
		path: v.string(),
		storageId: v.id("_storage"),
		size: v.number(),
		sha256: v.optional(v.string()),
		contentType: v.string(),
		updatedAtMs: v.number(),
	}).index("by_path", ["path"]),
});
