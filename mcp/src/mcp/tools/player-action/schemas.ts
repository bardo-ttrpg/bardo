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

export const discoveryCandidateSchema = z.object({
	kind: z.enum(["npc", "location", "faction", "item", "clue", "thread"]),
	id: z.string(),
	displayName: z.string(),
	discoveryMode: z.enum([
		"explicitly_named",
		"implicitly_present",
		"role_placeholder",
	]),
	confidence: z.enum(["high", "medium", "low"]),
	summary: z.string(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	persisted: z.boolean().optional(),
});

export const gmPacketSchema = z.object({
	sceneFrame: z.object({
		locationId: z.string(),
		locationName: z.string(),
		summary: z.string(),
		activeSituation: z.string(),
		exits: z.array(z.string()),
		sensoryCues: z.array(z.string()),
		unresolvedQuestions: z.array(z.string()),
	}),
	resolution: z.object({
		intent: z.string(),
		fiction: z.string(),
		mechanicsSummary: z.string(),
		outcome: z.enum(["success", "failure", "mixed"]),
	}),
	narrativeBeats: z.array(z.string()),
	npcReactions: z.array(
		z.object({
			npcId: z.string(),
			displayName: z.string(),
			reaction: z.string(),
			disposition: z.string(),
		}),
	),
	discoveries: z.array(discoveryCandidateSchema),
	consequences: z.object({
		timeAdvancedMinutes: z.number().int().nonnegative(),
		worldTimeAfterISO: z.string(),
		locationAfter: z.string(),
		clocksAdvanced: z.array(z.string()),
		threadsActivated: z.array(z.string()),
	}),
	followUps: z.array(z.string()),
	safetyNotes: z.array(z.string()),
	renderingHints: z.object({
		tone: z.string(),
		pacing: z.string(),
		revealLevel: z.string(),
		rulesTransparency: z.string(),
	}),
});

const stateDeltaSchema = z.object({
	worldTimeBeforeISO: z.string(),
	worldTimeAfterISO: z.string(),
	locationBefore: z.string(),
	locationAfter: z.string(),
	timeAdvancedMinutes: z.number().int().nonnegative(),
	createdNpcIds: z.array(z.string()),
	createdLocationIds: z.array(z.string()),
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
	gmPacket: gmPacketSchema,
	stateDelta: stateDeltaSchema,
	discoveryCandidates: z.array(discoveryCandidateSchema),
	canonicalEventIds: z.array(z.string()),
	confidence: z.object({
		narration: z.enum(["high", "medium", "low"]),
		discoveries: z.enum(["high", "medium", "low"]),
	}),
	completeness: z.object({
		gmPacket: z.boolean(),
		contextReady: z.boolean(),
	}),
	mechanics: z.object({
		ruleset: z
			.string()
			.describe("Ruleset adapter id used for mechanics resolution."),
		required: z
			.boolean()
			.describe("True when mechanics resolution was required"),
		resolved: z
			.boolean()
			.describe("True when mechanics were validated and resolved"),
		actionType: z
			.union([z.string(), z.null()])
			.describe("Resolved mechanics action type when applicable"),
		targetDifficulty: z
			.union([z.number().int(), z.null()])
			.describe("Target difficulty used for mechanics resolution"),
		modifier: z.number().int().describe("Applied mechanics modifier"),
		advantage: z
			.union([z.enum(["none", "advantage", "disadvantage"]), z.null()])
			.describe("Applied advantage mode when supported by ruleset"),
		rawRoll: z
			.union([z.number().int().min(1).max(20), z.null()])
			.describe("Selected raw die roll when resolved with dice"),
		total: z
			.union([z.number().int(), z.null()])
			.describe("Total resolved value when mechanics were applied"),
		outcome: z
			.union([z.enum(["success", "failure"]), z.null()])
			.describe("Resolved success/failure outcome"),
		margin: z
			.union([z.number().int(), z.null()])
			.describe("Outcome margin (total - targetDifficulty)"),
		resolutionMode: z
			.union([z.enum(["dice", "deterministic", "unsupported"]), z.null()])
			.describe("Resolution strategy used by the ruleset adapter."),
		unsupportedReason: z
			.union([z.string(), z.null()])
			.describe("Reason when mechanics request is unsupported by ruleset."),
		trace: z
			.union([z.record(z.string(), z.unknown()), z.null()])
			.describe("Ruleset-specific trace metadata for auditability."),
		validationErrors: z
			.array(z.string())
			.describe("Validation errors when mechanics payload is invalid"),
	}),
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
	setupPrompt: z.union([
		z.object({
			version: z.literal("2.0"),
			questionKey: z.enum([
				"purpose",
				"userProfile",
				"agentProfile",
				"workingPreferences",
				"boundaries",
				"successCriteria",
				"values",
				"ttrpgSystem",
				"diceRoller",
				"theme",
			]),
			prompt: z.string(),
			inputType: z.enum(["single_choice_or_text", "free_text"]),
			choices: z.array(
				z.object({
					id: z.string(),
					label: z.string(),
					description: z.string().optional(),
					recommended: z.boolean().optional(),
				}),
			),
			allowCustomText: z.boolean(),
			validation: z.object({
				minLength: z.number().int().positive().optional(),
				maxLength: z.number().int().positive().optional(),
				allowedChoiceIds: z.array(z.string()).optional(),
			}),
		}),
		z.null(),
	]),
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
