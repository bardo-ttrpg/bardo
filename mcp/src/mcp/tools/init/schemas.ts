import * as z from "zod/v4";

export const diceRollerSchema = z
	.enum(["player", "bardo"])
	.describe("Who rolls party character dice: `player` or `bardo`.");

export const optionalSystemsInputSchema = z
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

export const optionalSystemsOutputSchema = z.object({
	npcs: z.boolean(),
	quests: z.boolean(),
	items: z.boolean(),
	worldGeneration: z.boolean(),
});

export const initInputSchema = z
	.object({
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

export const workspaceSummarySchema = z.object({
	markdownFiles: z.number().int().nonnegative(),
	informativeFiles: z.number().int().nonnegative(),
	totalContentChars: z.number().int().nonnegative(),
	informativeByDirectory: z.record(z.string(), z.number().int().nonnegative()),
	looksSufficientForAutoScene: z.boolean(),
	worldLocationFiles: z.number().int().nonnegative(),
	worldInformativeFiles: z.number().int().nonnegative(),
	workspaceEmpty: z.boolean(),
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
});

export type DirectoryReport = z.infer<typeof directoryReportSchema>;
export type InitOutput = z.infer<typeof initOutputSchema>;
