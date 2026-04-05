import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
	resolveRulesetCatalog,
	resolveRulesetAdapter,
} from "../../domain/mechanics/rulesets/registry";
import { resolveBardoRoot } from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const rulesetMechanicsOverviewInputSchema = z.object({
	ruleset: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe(
			"Optional ruleset identifier to focus the overview on one mechanics profile.",
		),
});

const rulesetMechanicsOverviewOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	rootPath: z.string(),
	rulesets: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			sourceType: z.enum(["builtin", "workspace"]),
			capabilities: z.object({
				contested: z.boolean(),
				conditions: z.boolean(),
				initiative: z.boolean(),
				interrupts: z.boolean(),
				resourceTracking: z.boolean(),
			}),
			actionTypes: z.array(
				z.object({
					id: z.string(),
					label: z.string(),
					description: z.string().nullable(),
					intents: z.array(z.string()),
					supportLevel: z.enum(["full", "partial", "advisory"]),
					resolutionMode: z.enum([
						"dice",
						"deterministic",
						"partial",
						"advisory",
					]),
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
							steps: z.array(
								z.object({
									type: z.enum([
										"resource_effect",
										"clock_effect",
										"decision_node",
									]),
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
				}),
			),
		}),
	),
	recommendedFollowUpTools: z.array(z.string()),
});

export function registerRulesetMechanicsOverviewTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"ruleset_mechanics_overview",
		{
			title: "Ruleset Mechanics Overview",
			description:
				"Describe the available mechanics rulesets, their action vocabulary, and how completely Bardo can execute each action. When to use: use this before validation or resolution when an agent needs to discover what mechanics surface exists in the workspace and which actions are full, partial, or advisory. When not to use: do not use this to resolve an action, mutate canon, or retrieve broad lore; prefer validate_action_against_ruleset for action preflight and context_query for evidence retrieval. Example: inspect the uploaded ruleset before deciding whether a `positioning_test` can be resolved authoritatively or only scaffolded.",
			inputSchema: rulesetMechanicsOverviewInputSchema,
			outputSchema: rulesetMechanicsOverviewOutputSchema,
			annotations: {
				title: "Ruleset Mechanics Overview",
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ ruleset }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			try {
				const catalog = resolveRulesetCatalog({ bardoRoot });
				const filteredRulesets = ruleset
					? [
							{
								id: resolveRulesetAdapter(ruleset, { bardoRoot }).id,
							},
						]
					: catalog.rulesets;
				const rulesets = filteredRulesets.map((entry) => {
					const adapter = resolveRulesetAdapter(entry.id, { bardoRoot });
					return {
						id: adapter.id,
						title: adapter.title,
						sourceType: adapter.sourceType,
						capabilities: adapter.capabilities,
						actionTypes: adapter.actionTypes.map((action) => ({
							id: action.id,
							label: action.label,
							description: action.description,
							intents: action.intents,
							supportLevel: action.supportLevel,
							resolutionMode: action.resolution.mode,
							requiresHumanJudgment:
								action.supportLevel !== "full" ||
								action.resolution.mode === "partial" ||
								action.resolution.mode === "advisory",
							targetDifficulty: action.targetDifficulty,
							contested: action.contested,
							outcomeBands: action.outcomeBands,
							resourceEffects: action.resourceEffects,
							clockEffects: action.clockEffects,
							consequenceChains: action.consequenceChains,
							modifier: action.modifier,
							guidance: action.resolution.guidance,
						})),
					};
				});

				return makeToolResult({
					success: true,
					message:
						ruleset && rulesets.length === 1
							? `Loaded mechanics overview for ${rulesets[0]?.id}.`
							: `Loaded mechanics overview for ${String(rulesets.length)} ruleset(s).`,
					rootPath: bardoRoot,
					rulesets,
					recommendedFollowUpTools: [
						"validate_action_against_ruleset",
						"resolve_mechanics",
					],
				});
			} catch (error) {
				return makeToolResult(
					{
						success: false,
						message:
							error instanceof Error
								? `Failed to describe mechanics rulesets: ${error.message}`
								: "Failed to describe mechanics rulesets.",
						rootPath: bardoRoot,
						rulesets: [],
						recommendedFollowUpTools: [
							"validate_action_against_ruleset",
							"context_query",
						],
					},
					true,
				);
			}
		},
	);
}
