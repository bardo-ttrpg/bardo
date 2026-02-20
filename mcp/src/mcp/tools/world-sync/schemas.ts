import * as z from "zod/v4";

export const worldSyncInputSchema = z.object({
	transcript: z
		.string()
		.min(1)
		.max(40_000)
		.describe(
			"Narrative text block or conversation snippet to sync discovered names (NPCs/locations) into workspace files.",
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
	optionalSystems: z.object({
		npcs: z.boolean(),
		quests: z.boolean(),
		items: z.boolean(),
		worldGeneration: z.boolean(),
	}),
});

export type WorldSyncOutput = z.infer<typeof worldSyncOutputSchema>;
