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
	opposedDifficulty: z
		.number()
		.int()
		.optional()
		.describe("Optional opposing target or static opposition total for contested actions."),
	opposedModifier: z
		.number()
		.int()
		.optional()
		.describe("Optional opposing modifier for contested actions that roll an opposing expression."),
	opposedTotal: z
		.number()
		.int()
		.optional()
		.describe("Optional pre-resolved opposing total for contested actions."),
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
	availableResources: z
		.record(z.string(), z.number().int())
		.optional()
		.describe("Optional current resource snapshot for actions that spend, gain, or set tracked resources."),
});

const validateActionOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	rootPath: z.string(),
	valid: z.boolean(),
	safeToResolve: z.boolean(),
	ruleset: z.string(),
	rulesetTitle: z.string().nullable(),
	sourceType: z.enum(["builtin", "workspace"]).nullable(),
	supportLevel: z.enum(["full", "partial", "advisory"]).nullable(),
	supportedActionTypes: z.array(z.string()),
	rulesetCapabilities: z.object({
		contested: z.boolean(),
		conditions: z.boolean(),
		initiative: z.boolean(),
		interrupts: z.boolean(),
		resourceTracking: z.boolean(),
	}),
	errors: z.array(z.string()),
	warnings: z.array(z.string()),
	recommendedFollowUpTools: z.array(z.string()),
	resolutionPath: z.enum([
		"resolve_mechanics",
		"scene_turn",
		"clarify_or_reframe",
	]),
	actionDefinition: z.object({
		id: z.string(),
		label: z.string(),
		description: z.string().nullable(),
		intents: z.array(z.string()),
		supportLevel: z.enum(["full", "partial", "advisory"]),
		resolutionMode: z.enum(["dice", "deterministic", "partial", "advisory"]),
		requiresHumanJudgment: z.boolean(),
		targetDifficulty: z.object({
			required: z.boolean(),
			min: z.number().int().nullable(),
			max: z.number().int().nullable(),
			default: z.number().int().nullable(),
		}),
		contested: z.object({
			enabled: z.boolean(),
			opponentLabel: z.string().nullable(),
			opponentExpression: z.string().nullable(),
			tieOutcome: z.string().nullable(),
		}),
		outcomeBands: z.array(
			z.object({
				id: z.string(),
				label: z.string(),
				outcome: z.string(),
				minMargin: z.number().int().nullable(),
				maxMargin: z.number().int().nullable(),
				guidance: z.string().nullable(),
			}),
		),
		resourceEffects: z.array(
			z.object({
				resourceId: z.string(),
				operation: z.enum(["spend", "gain", "set"]),
				amount: z.number().int(),
				onOutcomes: z.array(z.string()),
				when: z
					.object({
						onOutcomes: z.array(z.string()),
						onOutcomeBands: z.array(z.string()),
						onComparisons: z.array(
							z.enum(["actor_wins", "opponent_wins", "tie", "unresolved"]),
						),
						minMargin: z.number().int().nullable(),
						maxMargin: z.number().int().nullable(),
						resourceAtOrBelow: z
							.object({
								resourceId: z.string(),
								value: z.number().int(),
							})
							.nullable(),
						resourceAtOrAbove: z
							.object({
								resourceId: z.string(),
								value: z.number().int(),
							})
							.nullable(),
					})
					.nullable(),
				guidance: z.string().nullable(),
			}),
		),
		clockEffects: z.array(
			z.object({
				clockId: z.string(),
				ticks: z.number().int().positive(),
				onOutcomes: z.array(z.string()),
				when: z
					.object({
						onOutcomes: z.array(z.string()),
						onOutcomeBands: z.array(z.string()),
						onComparisons: z.array(
							z.enum(["actor_wins", "opponent_wins", "tie", "unresolved"]),
						),
						minMargin: z.number().int().nullable(),
						maxMargin: z.number().int().nullable(),
						resourceAtOrBelow: z
							.object({
								resourceId: z.string(),
								value: z.number().int(),
							})
							.nullable(),
						resourceAtOrAbove: z
							.object({
								resourceId: z.string(),
								value: z.number().int(),
							})
							.nullable(),
					})
					.nullable(),
				guidance: z.string().nullable(),
			}),
		),
			consequenceChains: z.array(
				z.object({
					id: z.string(),
					label: z.string(),
					entrypoint: z.enum(["root", "branch"]),
					when: z
					.object({
						onOutcomes: z.array(z.string()),
						onOutcomeBands: z.array(z.string()),
						onComparisons: z.array(
							z.enum(["actor_wins", "opponent_wins", "tie", "unresolved"]),
						),
						minMargin: z.number().int().nullable(),
						maxMargin: z.number().int().nullable(),
						resourceAtOrBelow: z
							.object({
								resourceId: z.string(),
								value: z.number().int(),
							})
							.nullable(),
						resourceAtOrAbove: z
							.object({
								resourceId: z.string(),
								value: z.number().int(),
							})
							.nullable(),
					})
					.nullable(),
				steps: z.array(
					z.object({
						type: z.enum(["resource_effect", "clock_effect", "decision_node"]),
						when: z
							.object({
								onOutcomes: z.array(z.string()),
								onOutcomeBands: z.array(z.string()),
								onComparisons: z.array(
									z.enum([
										"actor_wins",
										"opponent_wins",
										"tie",
										"unresolved",
									]),
								),
								minMargin: z.number().int().nullable(),
								maxMargin: z.number().int().nullable(),
								resourceAtOrBelow: z
									.object({
										resourceId: z.string(),
										value: z.number().int(),
									})
									.nullable(),
								resourceAtOrAbove: z
									.object({
										resourceId: z.string(),
										value: z.number().int(),
									})
									.nullable(),
							})
							.nullable(),
							resourceId: z.string().optional(),
							operation: z.enum(["spend", "gain", "set"]).optional(),
							amount: z.number().int().optional(),
							clockId: z.string().optional(),
							ticks: z.number().int().positive().optional(),
						id: z.string().optional(),
						kind: z.literal("ask_the_table").optional(),
							prompt: z.string().optional(),
							options: z.array(z.string()).optional(),
							branches: z
								.array(
									z.object({
										chainId: z.string(),
										when: z
											.object({
												onOutcomes: z.array(z.string()),
												onOutcomeBands: z.array(z.string()),
												onComparisons: z.array(
													z.enum([
														"actor_wins",
														"opponent_wins",
														"tie",
														"unresolved",
													]),
												),
												minMargin: z.number().int().nullable(),
												maxMargin: z.number().int().nullable(),
												resourceAtOrBelow: z
													.object({
														resourceId: z.string(),
														value: z.number().int(),
													})
													.nullable(),
												resourceAtOrAbove: z
													.object({
														resourceId: z.string(),
														value: z.number().int(),
													})
													.nullable(),
											})
											.nullable(),
										guidance: z.string().nullable(),
									}),
								)
								.default([]),
							guidance: z.string().nullable(),
						}),
					),
			}),
		),
		modifier: z.object({
			default: z.number().int(),
			min: z.number().int().nullable(),
			max: z.number().int().nullable(),
		}),
		guidance: z.string().nullable(),
	}).nullable(),
	suggestedArguments: z.object({
		ruleset: z.string(),
		actionType: z.string(),
		targetDifficulty: z.number().int().nullable(),
		opposedDifficulty: z.number().int().nullable(),
		opposedModifier: z.number().int(),
		opposedTotal: z.number().int().nullable(),
		modifier: z.number().int(),
		actorId: z.string().nullable(),
		declaredIntent: z.string().nullable(),
		advantage: z.enum(["none", "advantage", "disadvantage"]).nullable(),
	}),
	normalized: z.object({
		ruleset: z.string(),
		actionType: z.string(),
		targetDifficulty: z.number().int().nullable(),
		opposedDifficulty: z.number().int().nullable(),
		opposedModifier: z.number().int(),
		opposedTotal: z.number().int().nullable(),
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
				"Validate a proposed mechanics action against the selected ruleset before any resolution or narration. When to use: use this to sanity-check action types, difficulties, modifiers, and advantage state before calling resolve_mechanics or narrating a rules-backed outcome. When not to use: do not use it for canon retrieval, passive reporting, or to commit an actual resolution; prefer context_query for evidence lookup and scene_turn for the full canon-affecting workflow. Example: validate whether a `skill_check` against `d20_v1` with target difficulty `15` and modifier `+3` is a supported request before rolling.",
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
			opposedDifficulty,
			opposedModifier,
			opposedTotal,
			modifier,
			actorId,
			declaredIntent,
			advantage,
			availableResources,
		}) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const resolvedRuleset = ruleset ?? "d20_v1";
			try {
				const adapter = resolveRulesetAdapter(resolvedRuleset, { bardoRoot });
				const validation = adapter.validate({
					actionType,
					targetDifficulty,
					opposedDifficulty,
					opposedModifier,
					opposedTotal,
					modifier,
					actorId,
					declaredIntent,
					advantage,
					availableResources,
				});
				const output: ValidateActionOutput = {
					success: true,
					message: validation.valid
						? `Action is valid for ${adapter.id} mechanics resolution.`
						: `Action is invalid for ${adapter.id} mechanics resolution.`,
					rootPath: bardoRoot,
					valid: validation.valid,
					safeToResolve:
						validation.valid &&
						validation.errors.length === 0 &&
						validation.supportLevel === "full",
					ruleset: adapter.id,
					rulesetTitle: adapter.title,
					sourceType: adapter.sourceType,
					supportLevel: validation.supportLevel,
					supportedActionTypes: [...adapter.supportedActionTypes],
					rulesetCapabilities: adapter.capabilities,
					errors: validation.errors,
					warnings: validation.warnings,
					recommendedFollowUpTools: validation.valid
						? validation.supportLevel === "full"
							? ["resolve_mechanics", "scene_turn"]
							: ["scene_turn", "context_query"]
						: ["validate_action_against_ruleset", "context_query"],
					resolutionPath: validation.valid
						? validation.supportLevel === "full"
							? "resolve_mechanics"
							: "scene_turn"
						: validation.errors.some((error) =>
								/Unsupported actionType/i.test(error),
							)
							? "scene_turn"
							: "clarify_or_reframe",
					actionDefinition: validation.actionDefinition
						? {
								id: validation.actionDefinition.id,
								label: validation.actionDefinition.label,
								description: validation.actionDefinition.description,
								intents: validation.actionDefinition.intents,
								supportLevel: validation.actionDefinition.supportLevel,
								resolutionMode: validation.actionDefinition.resolution.mode,
								requiresHumanJudgment:
									validation.actionDefinition.supportLevel !== "full" ||
									validation.actionDefinition.resolution.mode === "partial" ||
									validation.actionDefinition.resolution.mode === "advisory",
								targetDifficulty: validation.actionDefinition.targetDifficulty,
								contested: validation.actionDefinition.contested,
								outcomeBands: [...validation.actionDefinition.outcomeBands],
								resourceEffects: [...validation.actionDefinition.resourceEffects],
								clockEffects: [...validation.actionDefinition.clockEffects],
								consequenceChains:
									validation.actionDefinition.consequenceChains.map((chain) => ({
										id: chain.id,
										label: chain.label,
										entrypoint: chain.entrypoint,
										when: chain.when
											? {
													onOutcomes: [...chain.when.onOutcomes],
													onOutcomeBands: [...chain.when.onOutcomeBands],
													onComparisons: [...chain.when.onComparisons],
													minMargin: chain.when.minMargin,
													maxMargin: chain.when.maxMargin,
													resourceAtOrBelow: chain.when.resourceAtOrBelow
														? { ...chain.when.resourceAtOrBelow }
														: null,
													resourceAtOrAbove: chain.when.resourceAtOrAbove
														? { ...chain.when.resourceAtOrAbove }
														: null,
												}
											: null,
										steps: chain.steps.map((step) => ({
											type: step.type,
											when: step.when
												? {
														onOutcomes: [...step.when.onOutcomes],
														onOutcomeBands: [...step.when.onOutcomeBands],
														onComparisons: [...step.when.onComparisons],
														minMargin: step.when.minMargin,
														maxMargin: step.when.maxMargin,
														resourceAtOrBelow: step.when.resourceAtOrBelow
															? { ...step.when.resourceAtOrBelow }
															: null,
														resourceAtOrAbove: step.when.resourceAtOrAbove
															? { ...step.when.resourceAtOrAbove }
															: null,
													}
												: null,
											resourceId:
												step.type === "resource_effect" ? step.resourceId : undefined,
											operation:
												step.type === "resource_effect" ? step.operation : undefined,
											amount:
												step.type === "resource_effect" ? step.amount : undefined,
											clockId:
												step.type === "clock_effect" ? step.clockId : undefined,
											ticks:
												step.type === "clock_effect" ? step.ticks : undefined,
											id:
												step.type === "decision_node" ? step.id : undefined,
											kind:
												step.type === "decision_node" ? step.kind : undefined,
											prompt:
												step.type === "decision_node" ? step.prompt : undefined,
											options:
												step.type === "decision_node"
													? [...step.options]
													: undefined,
											branches: step.branches.map((branch) => ({
												chainId: branch.chainId,
												when: branch.when
													? {
															onOutcomes: [...branch.when.onOutcomes],
															onOutcomeBands: [
																...branch.when.onOutcomeBands,
															],
															onComparisons: [
																...branch.when.onComparisons,
															],
															minMargin: branch.when.minMargin,
															maxMargin: branch.when.maxMargin,
															resourceAtOrBelow:
																branch.when.resourceAtOrBelow
																	? { ...branch.when.resourceAtOrBelow }
																	: null,
															resourceAtOrAbove:
																branch.when.resourceAtOrAbove
																	? { ...branch.when.resourceAtOrAbove }
																	: null,
														}
													: null,
												guidance: branch.guidance,
											})),
											guidance: step.guidance,
										})),
									})),
								modifier: validation.actionDefinition.modifier,
								guidance: validation.actionDefinition.resolution.guidance,
							}
						: null,
					suggestedArguments: {
						ruleset: adapter.id,
						actionType: validation.normalized.actionType,
						targetDifficulty: validation.normalized.targetDifficulty,
						opposedDifficulty: validation.normalized.opposedDifficulty,
						opposedModifier: validation.normalized.opposedModifier,
						opposedTotal: validation.normalized.opposedTotal,
						modifier: validation.normalized.modifier,
						actorId: validation.normalized.actorId,
						declaredIntent: validation.normalized.declaredIntent,
						advantage: validation.normalized.advantage,
					},
					normalized: {
						ruleset: adapter.id,
						actionType: validation.normalized.actionType,
						targetDifficulty: validation.normalized.targetDifficulty,
						opposedDifficulty: validation.normalized.opposedDifficulty,
						opposedModifier: validation.normalized.opposedModifier,
						opposedTotal: validation.normalized.opposedTotal,
						modifier: validation.normalized.modifier,
						actorId: validation.normalized.actorId,
						declaredIntent: validation.normalized.declaredIntent,
						advantage: validation.normalized.advantage,
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
					safeToResolve: false,
					ruleset: resolvedRuleset,
					rulesetTitle: null,
					sourceType: null,
					supportLevel: null,
					supportedActionTypes: [],
					rulesetCapabilities: {
						contested: false,
						conditions: false,
						initiative: false,
						interrupts: false,
						resourceTracking: false,
					},
					errors: [],
					warnings: [],
					recommendedFollowUpTools: [
						"validate_action_against_ruleset",
						"context_query",
					],
					resolutionPath: "clarify_or_reframe",
					actionDefinition: null,
					suggestedArguments: {
						ruleset: resolvedRuleset,
						actionType,
						targetDifficulty: null,
						opposedDifficulty: null,
						opposedModifier: 0,
						opposedTotal: null,
						modifier: 0,
						actorId: null,
						declaredIntent: null,
						advantage: null,
					},
					normalized: {
						ruleset: resolvedRuleset,
						actionType,
						targetDifficulty: null,
						opposedDifficulty: null,
						opposedModifier: 0,
						opposedTotal: null,
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
