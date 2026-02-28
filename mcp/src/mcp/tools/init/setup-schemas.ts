import * as z from "zod/v4";

export const sourceMaterialsStatusSchema = z.enum([
	"complete",
	"partial",
	"none",
]);

export const sourcePolicySchema = z.enum([
	"use_provided_only",
	"allow_conservative_skeleton",
]);

export const setupAnswersSchema = z
	.object({
		ttrpgSystem: z.string().trim().min(2).max(160).optional(),
		theme: z.string().trim().min(2).max(120).optional(),
		systemUrl: z.string().trim().max(2_000).optional(),
		sourceMaterialsStatus: sourceMaterialsStatusSchema.optional(),
		diceRoller: z.enum(["player", "bardo"]).optional(),
		playerCount: z.number().int().min(1).max(20).optional(),
		sourcePolicy: sourcePolicySchema.optional(),
		additionalContext: z.string().trim().max(4_000).optional(),
		materialsConfirmation: z.string().trim().max(4_000).optional(),
	})
	.partial();

export const setupConflictSchema = z.object({
	detected: z.boolean(),
	reason: z.union([z.string(), z.null()]),
});

export const setupIntegritySchema = z.object({
	ok: z.boolean(),
	missingPaths: z.array(z.string()),
	invalidPaths: z.array(z.string()),
});

export type SetupAnswers = z.infer<typeof setupAnswersSchema>;
export type SourceMaterialsStatus = z.infer<typeof sourceMaterialsStatusSchema>;
export type SourcePolicy = z.infer<typeof sourcePolicySchema>;
