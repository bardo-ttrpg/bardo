import * as z from "zod/v4";

export const playerActionInputSchema = z.object({
	action: z
		.string()
		.min(1)
		.describe(
			"Natural player action message from the user (use this as the default gameplay entrypoint), e.g. `I travel to the village tavern`",
		)
		.max(1000),
});

export const playerActionOutputSchema = z.object({
	success: z.boolean().describe("True when the action was processed"),
	message: z.string().describe("Human-readable action summary"),
	rootPath: z.string().describe("Absolute bardo root path"),
	intent: z
		.enum(["travel", "explore", "social", "rest", "combat", "general"])
		.describe("Parsed high-level intent"),
	timeAdvancedMinutes: z.number().int().nonnegative(),
	worldTimeBeforeISO: z.string(),
	worldTimeAfterISO: z.string(),
	locationBefore: z.string(),
	locationAfter: z.string(),
	createdNpcIds: z.array(z.string()),
	createdLocationIds: z.array(z.string()),
	historyEntry: z.string(),
	statePath: z.string(),
	historyPath: z.string(),
	narrationGuardrails: z.array(z.string()),
	optionalSystems: z.object({
		npcs: z.boolean(),
		quests: z.boolean(),
		items: z.boolean(),
		worldGeneration: z.boolean(),
	}),
});

export type PlayerActionOutput = z.infer<typeof playerActionOutputSchema>;

export const narrationGuardrails = [
	"Use only locations already in workspace/state unless a tool call creates a new one.",
	"Keep unnamed characters as unknown NPCs until identity is discovered and persisted.",
	"When new proper names appear in narrative, sync them to workspace before reuse.",
] as const;
