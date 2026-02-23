import * as z from "zod/v4";
import {
	setupAnswersSchema,
	setupConflictSchema,
	setupIntegritySchema,
} from "../init/setup-schemas";

export const playerActionInputSchema = z.object({
	action: z
		.string()
		.min(1)
		.describe(
			"Natural player action message from the user (use this as the default gameplay entrypoint), e.g. `I travel to the village tavern`",
		)
		.max(1000),
	bootstrapAnswers: z
		.object({
			purpose: z.string().trim().min(3).max(3_000).optional(),
			userProfile: z.string().trim().min(3).max(3_000).optional(),
			agentProfile: z.string().trim().min(3).max(3_000).optional(),
			workingPreferences: z.string().trim().min(3).max(3_000).optional(),
			boundaries: z.string().trim().min(3).max(3_000).optional(),
			successCriteria: z.string().trim().min(3).max(3_000).optional(),
			values: z.string().trim().min(3).max(3_000).optional(),
		})
		.partial()
		.optional(),
	setupAnswers: setupAnswersSchema.optional(),
	setupRevision: z.number().int().nonnegative().optional(),
	idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

export const playerActionOutputSchema = z.object({
	success: z.boolean().describe("True when the action was processed"),
	message: z.string().describe("Human-readable action summary"),
	idempotentReplay: z
		.boolean()
		.describe("True when the response was replayed via idempotency key"),
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
	requiresSetup: z.boolean(),
	setupStatus: z.enum(["needs_input", "complete", "error", "locked"]),
	setupQuestionKey: z.union([z.string(), z.null()]),
	setupQuestion: z.union([z.string(), z.null()]),
	setupProgressAnswered: z.number().int().nonnegative(),
	setupProgressTotal: z.number().int().nonnegative(),
	setupWarnings: z.array(z.string()),
	setupEvidenceSummary: z.array(z.string()),
	setupRevision: z.number().int().nonnegative(),
	setupConflict: setupConflictSchema,
	setupIntegrity: setupIntegritySchema,
	pendingAction: z.union([z.string(), z.null()]),
});

export type PlayerActionOutput = z.infer<typeof playerActionOutputSchema>;

export const narrationGuardrails = [
	"Use only locations already in workspace/state unless a tool call creates a new one.",
	"Keep unnamed characters as unknown NPCs until identity is discovered and persisted.",
	"When new proper names appear in narrative, sync them to workspace before reuse.",
] as const;
