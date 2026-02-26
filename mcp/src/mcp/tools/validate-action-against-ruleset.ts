import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { resolveRulesetAdapter } from "../../domain/mechanics/rulesets/registry";
import { resolveBardoRoot } from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const validateActionInputSchema = z.object({
	ruleset: z
		.string()
		.trim()
		.min(1)
		.default("d20_v1")
		.describe(
			"Rules profile identifier (for example `d20_v1`, `narrative_v1`).",
		),
	actionType: z
		.string()
		.trim()
		.min(1)
		.max(80)
		.describe("Mechanics action class to validate for the selected ruleset."),
	targetDifficulty: z
		.number()
		.int()
		.optional()
		.describe("Optional target number for success."),
	modifier: z
		.number()
		.int()
		.optional()
		.describe("Total modifier applied during resolution."),
	actorId: z
		.string()
		.trim()
		.min(1)
		.max(120)
		.optional()
		.describe("Optional actor/entity id."),
	declaredIntent: z
		.string()
		.trim()
		.max(600)
		.optional()
		.describe("Original player intent text that led to this mechanics action."),
	advantage: z
		.enum(["none", "advantage", "disadvantage"])
		.optional()
		.describe("Optional advantage mode when the ruleset supports it."),
});

const validateActionOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	rootPath: z.string(),
	valid: z.boolean(),
	ruleset: z.string(),
	supportedActionTypes: z.array(z.string()),
	errors: z.array(z.string()),
	warnings: z.array(z.string()),
	normalized: z.object({
		ruleset: z.string(),
		actionType: z.string(),
		targetDifficulty: z.number().int().nullable(),
		modifier: z.number().int(),
		actorId: z.string().nullable(),
		declaredIntent: z.string().nullable(),
		advantage: z.enum(["none", "advantage", "disadvantage"]).nullable(),
	}),
});

type ValidateActionOutput = z.infer<typeof validateActionOutputSchema>;

export function registerValidateActionAgainstRulesetTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"validate_action_against_ruleset",
		{
			title: "Validate Action Against Ruleset",
			description:
				"Validate mechanics intent against the selected ruleset profile before resolution.",
			inputSchema: validateActionInputSchema,
			outputSchema: validateActionOutputSchema,
			annotations: {
				title: "Validate Action Against Ruleset",
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({
			ruleset,
			actionType,
			targetDifficulty,
			modifier,
			actorId,
			declaredIntent,
			advantage,
		}) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const resolvedRuleset = ruleset ?? "d20_v1";
			try {
				const adapter = resolveRulesetAdapter(resolvedRuleset);
				const validation = adapter.validate({
					actionType,
					targetDifficulty,
					modifier,
					actorId,
					declaredIntent,
					advantage,
				});
				const output: ValidateActionOutput = {
					success: true,
					message: validation.valid
						? `Action is valid for ${adapter.id} mechanics resolution.`
						: `Action is invalid for ${adapter.id} mechanics resolution.`,
					rootPath: bardoRoot,
					valid: validation.valid,
					ruleset: adapter.id,
					supportedActionTypes: [...adapter.supportedActionTypes],
					errors: validation.errors,
					warnings: validation.warnings,
					normalized: {
						...validation.normalized,
						ruleset: adapter.id,
					},
				};
				return makeToolResult(output);
			} catch (error) {
				const output: ValidateActionOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to validate action: ${error.message}`
							: "Failed to validate action.",
					rootPath: bardoRoot,
					valid: false,
					ruleset: resolvedRuleset,
					supportedActionTypes: [],
					errors: [],
					warnings: [],
					normalized: {
						ruleset: resolvedRuleset,
						actionType,
						targetDifficulty: null,
						modifier: 0,
						actorId: null,
						declaredIntent: null,
						advantage: null,
					},
				};
				return makeToolResult(output, true);
			}
		},
	);
}
