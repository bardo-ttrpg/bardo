import * as z from "zod/v4";

const worldDiscoverySchema = z.object({
	kind: z.enum(["npc", "location", "faction", "item", "clue", "thread"]),
	id: z.string().optional(),
	displayName: z.string(),
	discoveryMode: z.enum([
		"explicitly_named",
		"implicitly_present",
		"role_placeholder",
	]),
	confidence: z.enum(["high", "medium", "low"]),
	summary: z.string().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	persisted: z.boolean().optional(),
});

export const worldSyncInputSchema = z.object({
	transcript: z
		.string()
		.max(40_000)
		.min(1)
		.optional()
		.describe(
			"Narrative text block or conversation snippet to sync discovered names (NPCs/locations) into workspace files.",
		),
	discoveries: z
		.array(worldDiscoverySchema)
		.optional()
		.describe(
			"Structured discoveries to persist. When provided, these are the primary sync source and transcript parsing becomes fallback-only.",
		),
	currentLocationHint: z
		.string()
		.optional()
		.describe(
			"Optional current location slug/name hint for linking discovered NPCs",
		),
});

export const worldSyncOutputSchema = z.object({
	success: z.boolean().describe("True when world sync completed"),
	message: z.string().describe("Human-readable summary"),
	rootPath: z.string().describe("Absolute bardo root path"),
	statePath: z.string(),
	historyPath: z.string(),
	extractedLocationNames: z.array(z.string()),
	extractedNpcNames: z.array(z.string()),
	createdLocationIds: z.array(z.string()),
	createdNpcIds: z.array(z.string()),
	existingLocationIds: z.array(z.string()),
	existingNpcIds: z.array(z.string()),
	currentLocationAfter: z.string(),
	persistedDiscoveries: z.array(worldDiscoverySchema),
	optionalSystems: z.object({
		npcs: z.boolean(),
		quests: z.boolean(),
		items: z.boolean(),
		worldGeneration: z.boolean(),
	}),
});

export type WorldSyncOutput = z.infer<typeof worldSyncOutputSchema>;
