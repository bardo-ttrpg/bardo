import * as z from "zod/v4";
import {
	setupAnswersSchema,
	setupConflictSchema,
	setupIntegritySchema,
} from "./setup-schemas";

const diceRollerSchema = z
	.enum(["player", "bardo"])
	.describe("Who rolls party character dice: `player` or `bardo`.");

const bootstrapAnswerKeySchema = z.enum([
	"purpose",
	"userProfile",
	"agentProfile",
	"workingPreferences",
	"boundaries",
	"successCriteria",
	"values",
]);

const bootstrapAnswersInputSchema = z
	.object({
		purpose: z
			.string()
			.trim()
			.min(3)
			.max(3_000)
			.optional()
			.describe("Answer for: What are we building together?"),
		userProfile: z
			.string()
			.trim()
			.min(3)
			.max(3_000)
			.optional()
			.describe("User profile, constraints, and context."),
		agentProfile: z
			.string()
			.trim()
			.min(3)
			.max(3_000)
			.optional()
			.describe("How the agent should behave and collaborate."),
		workingPreferences: z
			.string()
			.trim()
			.min(3)
			.max(3_000)
			.optional()
			.describe("Communication style, verbosity, and cadence."),
		boundaries: z
			.string()
			.trim()
			.min(3)
			.max(3_000)
			.optional()
			.describe("Boundaries or red flags to avoid."),
		successCriteria: z
			.string()
			.trim()
			.min(3)
			.max(3_000)
			.optional()
			.describe("Success definition and checkpoint expectations."),
		values: z
			.string()
			.trim()
			.min(3)
			.max(3_000)
			.optional()
			.describe(
				"Optional values answer used when `SOUL.md` exists in workspace.",
			),
	})
	.partial()
	.describe(
		"One-time bootstrap answers for /init. Provide only the answer requested in `nextPrompts` to keep one-question-at-a-time flow.",
	);

const optionalSystemsInputSchema = z
	.object({
		npcs: z
			.boolean()
			.optional()
			.describe("Enable or disable NPC-related gameplay generation."),
		quests: z
			.boolean()
			.optional()
			.describe("Enable or disable quest-related gameplay generation."),
		items: z
			.boolean()
			.optional()
			.describe("Enable or disable item/loot-related gameplay generation."),
		worldGeneration: z
			.boolean()
			.optional()
			.describe("Enable or disable automatic world expansion behavior."),
	})
	.partial()
	.describe(
		"Optional non-core gameplay systems. Core setup and state tools are always active and cannot be disabled.",
	);

const optionalSystemsOutputSchema = z.object({
	npcs: z.boolean(),
	quests: z.boolean(),
	items: z.boolean(),
	worldGeneration: z.boolean(),
});

export const initInputSchema = z
	.object({
		bootstrapOnly: z
			.boolean()
			.optional()
			.describe(
				"When true, run only bootstrap orchestration and skip campaign scene/state setup.",
			),
		bootstrapAnswers: bootstrapAnswersInputSchema.optional(),
		setupAnswers: setupAnswersSchema.optional(),
		setupRevision: z.number().int().nonnegative().optional(),
		diceRoller: diceRollerSchema
			.optional()
			.describe(
				"Required once per campaign. If missing and no saved value exists, the assistant must ask the user to pick `player` or `bardo`.",
			),
		theme: z
			.string()
			.trim()
			.min(2)
			.max(120)
			.optional()
			.describe(
				"Game theme/category (for example: `dark fantasy`, `space opera`, `post-apocalyptic survival`). Used to guide world generation and future behavior.",
			),
		optionalSystems: optionalSystemsInputSchema.optional(),
		startingScene: z
			.string()
			.trim()
			.min(1)
			.max(8_000)
			.optional()
			.describe(
				"Optional opening scene text. If omitted, init uses workspace world content first; if none exists, it generates a scene from theme-aware procedural map data.",
			),
	})
	.strict();

export const directoryReportSchema = z.object({
	name: z.string().describe("Directory logical name"),
	path: z.string().describe("Absolute filesystem path"),
	existedBefore: z
		.boolean()
		.describe("Whether the path existed before this tool call"),
	createdNow: z.boolean().describe("Whether this call created the directory"),
	isDirectory: z
		.boolean()
		.describe("Whether the path is currently a directory"),
});

const workspaceSummarySchema = z.object({
	markdownFiles: z.number().int().nonnegative(),
	informativeFiles: z.number().int().nonnegative(),
	totalContentChars: z.number().int().nonnegative(),
	informativeByDirectory: z.record(z.string(), z.number().int().nonnegative()),
	looksSufficientForAutoScene: z.boolean(),
	worldLocationFiles: z.number().int().nonnegative(),
	worldInformativeFiles: z.number().int().nonnegative(),
	workspaceEmpty: z.boolean(),
});

const bootstrapOutputSchema = z.object({
	complete: z
		.boolean()
		.describe("True when OpenClaw-style bootstrap ritual is completed."),
	alreadyInitialized: z
		.boolean()
		.describe("True when /init detected a previously completed bootstrap."),
	pendingQuestionKey: z
		.union([bootstrapAnswerKeySchema, z.null()])
		.describe("Current missing bootstrap answer key, or null when complete."),
	nextPrompt: z
		.union([z.string(), z.null()])
		.describe("Single next bootstrap prompt, or null when complete."),
	bootstrapPath: z.string().describe("Absolute path to BOOTSTRAP.md"),
	identityPath: z.string().describe("Absolute path to IDENTITY.md"),
	userPath: z.string().describe("Absolute path to USER.md"),
	soulPath: z.string().describe("Absolute path to SOUL.md"),
	includeValues: z
		.boolean()
		.describe("True when SOUL values are required in bootstrap workflow."),
	answeredCount: z
		.number()
		.int()
		.nonnegative()
		.describe("Number of bootstrap questions answered so far."),
	totalQuestions: z
		.number()
		.int()
		.nonnegative()
		.describe("Total required bootstrap questions in this workspace."),
});

const setupPromptChoiceSchema = z.object({
	id: z.string(),
	label: z.string(),
	description: z.string().optional(),
	recommended: z.boolean().optional(),
});

const setupPromptValidationSchema = z.object({
	minLength: z.number().int().positive().optional(),
	maxLength: z.number().int().positive().optional(),
	allowedChoiceIds: z.array(z.string()).optional(),
});

const setupPromptSchema = z.object({
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
		"campaignPremise",
		"openingSituation",
		"partyRoster",
		"sourceAdaptationNotes",
	]),
	prompt: z.string(),
	inputType: z.enum(["single_choice_or_text", "free_text"]),
	choices: z.array(setupPromptChoiceSchema),
	allowCustomText: z.boolean(),
	validation: setupPromptValidationSchema,
});

const startingScenePacketSchema = z.object({
	locationName: z.string(),
	locationSlug: z.string(),
	summary: z.string(),
	openingQuestion: z.string(),
	source: z.enum([
		"user_provided",
		"generated_from_workspace",
		"generated_from_theme_map",
		"existing_scene_reused",
		"not_available",
	]),
});

export const initOutputSchema = z.object({
	success: z.boolean().describe("True when initialization operation completed"),
	setupComplete: z
		.boolean()
		.describe(
			"True only when workspace exists, dice roller preference is saved, and a starting scene is ready.",
		),
	requiresUserInput: z
		.boolean()
		.describe(
			"True when the assistant should ask the user for missing setup details",
		),
	setupPrompt: z
		.union([setupPromptSchema, z.null()])
		.describe(
			"Structured setup question contract (v2). Clients must render this directly instead of synthesizing options.",
		),
	message: z.string().describe("Human-readable summary"),
	nextPrompts: z
		.array(z.string())
		.describe("Direct prompts the assistant should ask the user next"),
	rootPath: z.string().describe("Absolute bardo root path"),
	rootExistedBefore: z
		.boolean()
		.describe("Whether the bardo root already existed before this call"),
	createdDirectories: z
		.array(z.string())
		.describe("Absolute paths created during this call"),
	existingDirectories: z
		.array(z.string())
		.describe("Absolute paths that already existed as directories"),
	directories: z
		.array(directoryReportSchema)
		.describe(
			"Per-directory status report including root and all subdirectories",
		),
	diceRoller: z
		.union([diceRollerSchema, z.null()])
		.describe("Saved dice roller preference or null when still missing"),
	theme: z
		.union([z.string(), z.null()])
		.describe("Saved theme/category preference or null when missing"),
	optionalSystems: optionalSystemsOutputSchema.describe(
		"Resolved non-core system toggles for this campaign",
	),
	settingsPath: z
		.string()
		.describe("Absolute path of saved setup settings markdown"),
	legacySettingsPath: z
		.string()
		.describe("Legacy settings path checked for backward compatibility"),
	legacySettingsDetected: z
		.boolean()
		.describe("True when legacy `state/settings.md` was detected"),
	startingScenePath: z
		.string()
		.describe("Absolute path for the starting scene markdown file"),
	mapPath: z
		.string()
		.describe("Absolute path of generated or reusable map markdown"),
	mapGenerated: z
		.boolean()
		.describe("True when init generated map content this run"),
	startingSceneSource: z
		.enum([
			"user_provided",
			"generated_from_workspace",
			"generated_from_theme_map",
			"existing_scene_reused",
			"not_available",
		])
		.describe("How starting scene content was resolved"),
	startingScenePreview: z
		.string()
		.describe("Short preview of the active starting scene content"),
	startingScenePacket: z
		.union([startingScenePacketSchema, z.null()])
		.optional()
		.describe(
			"Structured opening-scene packet for agents to render without re-reading files.",
		),
	spawnLocationSlug: z
		.string()
		.optional()
		.describe("Spawn location slug selected during setup"),
	spawnLocationName: z
		.string()
		.optional()
		.describe("Spawn location display name selected during setup"),
	spawnOrigin: z
		.enum(["workspace", "map", "wilderness", "existing_state"])
		.optional()
		.describe("Where the selected spawn came from"),
	workspaceSummary: workspaceSummarySchema.describe(
		"Signal used to decide whether auto-generating a scene is safe",
	),
	statePath: z.string().describe("Absolute path to campaign state markdown"),
	historyPath: z
		.string()
		.describe("Absolute path to campaign history markdown"),
	bootstrap: bootstrapOutputSchema.describe(
		"OpenClaw-style /init bootstrap status and artifact paths",
	),
	setupStatus: z
		.enum(["needs_input", "complete", "error", "locked"])
		.optional(),
	setupQuestionKey: z.union([z.string(), z.null()]).optional(),
	setupQuestion: z.union([z.string(), z.null()]).optional(),
	setupRevision: z.number().int().nonnegative().optional(),
	setupConflict: setupConflictSchema.optional(),
	setupIntegrity: setupIntegritySchema.optional(),
	deprecationNotice: z.string().optional(),
});

export type DirectoryReport = z.infer<typeof directoryReportSchema>;
export type InitOutput = z.infer<typeof initOutputSchema>;
