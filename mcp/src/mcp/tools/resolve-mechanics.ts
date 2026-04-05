import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { appendCanonicalEvent } from "../../domain/events/store";
import {
	getIdempotentResult,
	setIdempotentResult,
} from "../../domain/idempotency/store";
import { resolveRulesetAdapter } from "../../domain/mechanics/rulesets/registry";
import { resolveBardoRoot } from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const resolveMechanicsInputSchema = z.object({
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
		.describe("Mechanics action class to resolve for the selected ruleset."),
	targetDifficulty: z
		.number()
		.int()
		.min(1)
		.max(40)
		.optional()
		.describe("Optional target number for success when required by ruleset."),
	opposedDifficulty: z
		.number()
		.int()
		.optional()
		.describe("Optional opposing target or static opposition total for contested actions."),
	opposedModifier: z
		.number()
		.int()
		.default(0)
		.describe("Optional opposing modifier for contested actions that roll an opposing expression."),
	opposedTotal: z
		.number()
		.int()
		.optional()
		.describe("Optional pre-resolved opposing total for contested actions."),
	modifier: z
		.number()
		.int()
		.min(-100)
		.max(100)
		.default(0)
		.describe("Total modifier applied during ruleset resolution."),
	advantage: z
		.enum(["none", "advantage", "disadvantage"])
		.default("none")
		.describe("Advantage mode for rulesets that support d20-style rolls."),
	actorId: z
		.string()
		.trim()
		.min(1)
		.max(120)
		.optional()
		.describe("Optional actor/entity id that initiated the action."),
	declaredIntent: z
		.string()
		.trim()
		.max(600)
		.optional()
		.describe(
			"Optional narrative intent that produced this mechanics request.",
		),
	availableResources: z
		.record(z.string(), z.number().int())
		.optional()
		.describe("Optional current resource snapshot for actions that spend, gain, or set tracked resources."),
	idempotencyKey: z
		.string()
		.trim()
		.min(8)
		.max(256)
		.optional()
		.describe("Optional idempotency key for safe replay."),
});

const resolveMechanicsOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	rootPath: z.string(),
	idempotentReplay: z.boolean(),
	ruleset: z.string(),
	rulesetTitle: z.string().nullable(),
	sourceType: z.enum(["builtin", "workspace"]).nullable(),
	actionType: z.string(),
	supportLevel: z.enum(["full", "partial", "advisory"]).nullable(),
	targetDifficulty: z.number().int().nullable(),
	modifier: z.number().int(),
	advantage: z.enum(["none", "advantage", "disadvantage"]).nullable(),
	rawRoll: z.number().int().min(1).nullable(),
	rolls: z.array(z.number().int().min(1)),
	total: z.number().int().nullable(),
	outcome: z.string().nullable(),
	margin: z.number().int().nullable(),
	outcomeBand: z
		.object({
			id: z.string(),
			label: z.string(),
			guidance: z.string().nullable(),
		})
		.nullable(),
	contested: z
		.object({
			enabled: z.boolean(),
			opponentLabel: z.string().nullable(),
			opponentRolls: z.array(z.number().int().min(1)),
			opponentTotal: z.number().int().nullable(),
			comparison: z.enum([
				"actor_wins",
				"opponent_wins",
				"tie",
				"unresolved",
			]),
		})
		.nullable(),
	stateEffects: z.object({
		resources: z.array(
			z.object({
				resourceId: z.string(),
				operation: z.enum(["spend", "gain", "set"]),
				amount: z.number().int(),
				balanceAfter: z.number().int().nullable(),
				guidance: z.string().nullable(),
			}),
		),
		clocks: z.array(
			z.object({
				clockId: z.string(),
				ticks: z.number().int().positive(),
				guidance: z.string().nullable(),
			}),
		),
	}),
		consequencePlan: z.object({
			matchedChains: z.array(
				z.object({
					id: z.string(),
					label: z.string(),
					reason: z.string().nullable(),
				}),
			),
			branchTransitions: z.array(
				z.object({
					fromChainId: z.string(),
					fromChainLabel: z.string(),
					stepIndex: z.number().int().nonnegative(),
					toChainId: z.string(),
					toChainLabel: z.string().nullable(),
					guidance: z.string().nullable(),
				}),
			),
			steps: z.array(
				z.object({
				chainId: z.string(),
				chainLabel: z.string(),
				stepIndex: z.number().int().nonnegative(),
				type: z.enum(["resource_effect", "clock_effect", "decision_node"]),
				applied: z.boolean(),
				skippedReason: z.string().nullable(),
				guidance: z.string().nullable(),
				resourceId: z.string().nullable(),
				operation: z.enum(["spend", "gain", "set"]).nullable(),
				amount: z.number().int().nullable(),
				balanceAfter: z.number().int().nullable(),
				clockId: z.string().nullable(),
				ticks: z.number().int().nullable(),
					decisionId: z.string().nullable(),
					prompt: z.string().nullable(),
					options: z.array(z.string()),
					unlockedChainIds: z.array(z.string()),
				}),
			),
		decisionNodes: z.array(
			z.object({
				id: z.string(),
				kind: z.literal("ask_the_table"),
				prompt: z.string(),
				options: z.array(z.string()),
				guidance: z.string().nullable(),
				chainId: z.string(),
				chainLabel: z.string(),
				stepIndex: z.number().int().nonnegative(),
			}),
		),
	}),
	resolutionMode: z.enum([
		"dice",
		"deterministic",
		"partial",
		"advisory",
		"unsupported",
	]),
	requiresHumanJudgment: z.boolean(),
	unsupportedReason: z.string().nullable(),
	mechanicsTrace: z.record(z.string(), z.unknown()),
	appendedEventTypes: z.array(z.string()),
	playerFacingSummary: z.string(),
	gmAdjudication: z.string(),
	recommendedFollowUpTools: z.array(z.string()),
	writePlan: z.object({
		shouldWrite: z.boolean(),
		targets: z.array(
			z.object({
				path: z.string(),
				operation: z.enum(["append", "refresh"]),
				reason: z.string(),
			}),
		),
	}),
});

type ResolveMechanicsOutput = z.infer<typeof resolveMechanicsOutputSchema>;

function normalizeIdempotencyKey(idempotencyKey: string | undefined): string {
	if (!idempotencyKey) {
		return crypto.randomUUID();
	}
	return idempotencyKey
		.toLowerCase()
		.replaceAll(/[^a-z0-9_-]/g, "-")
		.slice(0, 80);
}

export function registerResolveMechanicsTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"resolve_mechanics",
		{
			title: "Resolve Mechanics",
			description:
				"Resolve a rules-backed mechanics action and append the authoritative mechanics events to canon. When to use: use this after validation when a client needs a specific adjudication result, including rolls, totals, outcome, and canonical mechanics events. When not to use: do not use it for passive lookup, continuity audits, or broad scene orchestration; prefer validate_action_against_ruleset for preflight checks and scene_turn when the whole scene needs canon-aware resolution. Example: resolve a `skill_check` in `d20_v1` with target difficulty `15`, modifier `3`, and `advantage` set to `none` to determine whether the action succeeds.",
			inputSchema: resolveMechanicsInputSchema,
			outputSchema: resolveMechanicsOutputSchema,
			annotations: {
				title: "Resolve Mechanics",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
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
			advantage,
			actorId,
			declaredIntent,
			availableResources,
			idempotencyKey,
		}) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const resolvedRuleset = ruleset ?? "d20_v1";
			const resolvedModifier = modifier ?? 0;
			const resolvedAdvantage = advantage ?? "none";
			try {
				if (idempotencyKey) {
					const replay = await getIdempotentResult({
						bardoRoot,
						key: idempotencyKey,
						scope: "resolve_mechanics",
					});
					if (replay) {
						return makeToolResult({
							...(replay as ResolveMechanicsOutput),
							idempotentReplay: true,
						});
					}
				}

				const adapter = resolveRulesetAdapter(resolvedRuleset, { bardoRoot });
				const resolution = adapter.resolve({
					actionType,
					targetDifficulty,
					opposedDifficulty,
					opposedModifier,
					opposedTotal,
					modifier: resolvedModifier,
					advantage: resolvedAdvantage,
					actorId,
					declaredIntent,
					availableResources,
				});

				const outputBase: Omit<
					ResolveMechanicsOutput,
					| "success"
					| "message"
					| "idempotentReplay"
					| "appendedEventTypes"
					| "playerFacingSummary"
					| "gmAdjudication"
					| "recommendedFollowUpTools"
					| "writePlan"
				> = {
					rootPath: bardoRoot,
					ruleset: adapter.id,
					rulesetTitle: adapter.title,
					sourceType: adapter.sourceType,
					actionType: resolution.actionType,
					supportLevel: resolution.supportLevel,
					targetDifficulty: resolution.targetDifficulty,
					modifier: resolution.modifier,
					advantage: resolution.advantage,
					rawRoll: resolution.rawRoll,
					rolls: resolution.rolls,
					total: resolution.total,
					outcome: resolution.outcome,
					margin: resolution.margin,
						outcomeBand: resolution.outcomeBand,
						contested: resolution.contested,
						stateEffects: resolution.stateEffects,
						consequencePlan: resolution.consequencePlan,
						resolutionMode: resolution.resolutionMode,
					requiresHumanJudgment: resolution.requiresHumanJudgment,
					unsupportedReason: resolution.unsupportedReason,
					mechanicsTrace: resolution.trace,
				};

				if (resolution.resolutionMode === "unsupported") {
					const unsupportedOutput: ResolveMechanicsOutput = {
						...outputBase,
						success: false,
						message:
							resolution.unsupportedReason ??
							`Unsupported mechanics request for ruleset '${adapter.id}'.`,
						idempotentReplay: false,
						appendedEventTypes: [],
						playerFacingSummary:
							"The requested mechanics action could not be resolved safely.",
						gmAdjudication:
							resolution.unsupportedReason ??
							"The action needs clarification or a different workflow before adjudication.",
						recommendedFollowUpTools: [
							"validate_action_against_ruleset",
							"scene_turn",
						],
						writePlan: {
							shouldWrite: false,
							targets: [],
						},
					};
					return makeToolResult(unsupportedOutput, true);
				}

				if (
					resolution.resolutionMode === "advisory" ||
					resolution.resolutionMode === "partial" ||
					resolution.requiresHumanJudgment
				) {
					const guidanceOutput: ResolveMechanicsOutput = {
						...outputBase,
						success: true,
						message:
							resolution.resolutionMode === "advisory"
								? "Mechanics guidance prepared; final adjudication still needs human judgment."
								: "Mechanics scaffold prepared; final adjudication still needs human judgment.",
						idempotentReplay: false,
						appendedEventTypes: [],
						playerFacingSummary:
							resolution.resolutionMode === "advisory"
								? "This action has been framed for the table, but the final cost or outcome still needs a human ruling."
								: "This action has a structured mechanics scaffold, but the final outcome still needs a human ruling.",
						gmAdjudication:
							typeof resolution.trace.guidance === "string"
								? resolution.trace.guidance
								: "Use the returned mechanics scaffold as guidance, then finalize the outcome with table judgment.",
						recommendedFollowUpTools: ["scene_turn", "context_query"],
						writePlan: {
							shouldWrite: false,
							targets: [],
						},
					};
					if (idempotencyKey) {
						await setIdempotentResult({
							bardoRoot,
							key: idempotencyKey,
							scope: "resolve_mechanics",
							result: guidanceOutput,
							nowIso: new Date().toISOString(),
						});
					}
					return makeToolResult(guidanceOutput);
				}

				const nowIso = new Date().toISOString();
				const normalizedKey = normalizeIdempotencyKey(idempotencyKey);
				const appendedEventTypes: string[] = [];

				if (resolution.rolls.length > 0) {
					await appendCanonicalEvent({
						bardoRoot,
						event: {
							id: `evt-dice-rolled-${normalizedKey}`,
							type: "dice_rolled",
							atISO: nowIso,
							source: "resolve_mechanics",
							data: {
								ruleset: adapter.id,
								actionType: resolution.actionType,
								actorId: actorId ?? null,
								rollType:
									resolution.resolutionMode === "dice"
										? "ruleset_dice"
										: "ruleset",
								rolls: resolution.rolls,
								selectedRoll: resolution.rawRoll,
								modifier: resolution.modifier,
								total: resolution.total,
								advantage: resolution.advantage,
							},
						},
					});
					appendedEventTypes.push("dice_rolled");
				}

				await appendCanonicalEvent({
					bardoRoot,
					event: {
						id: `evt-mechanics-resolved-${normalizedKey}`,
						type: "mechanics_resolved",
						atISO: nowIso,
						source: "resolve_mechanics",
						data: {
							ruleset: adapter.id,
							actionType: resolution.actionType,
							actorId: actorId ?? null,
							targetDifficulty: resolution.targetDifficulty,
							modifier: resolution.modifier,
							advantage: resolution.advantage,
							rawRoll: resolution.rawRoll,
							total: resolution.total,
							outcome: resolution.outcome,
							margin: resolution.margin,
							outcomeBand: resolution.outcomeBand,
							contested: resolution.contested,
							stateEffects: resolution.stateEffects,
							consequencePlan: resolution.consequencePlan,
							resolutionMode: resolution.resolutionMode,
							trace: resolution.trace,
						},
					},
				});
				appendedEventTypes.push("mechanics_resolved");

				const output: ResolveMechanicsOutput = {
					...outputBase,
					success: true,
					message: "Mechanics resolved successfully.",
					idempotentReplay: false,
					appendedEventTypes,
					playerFacingSummary:
						resolution.outcome === null
							? "The mechanics resolved, but the final table-facing outcome still needs interpretation."
							: `The action resolves as ${resolution.outcome} with a total of ${String(resolution.total ?? 0)}${
									resolution.targetDifficulty !== null
										? ` against ${String(resolution.targetDifficulty)}`
										: ""
								}.`,
					gmAdjudication:
						resolution.resolutionMode === "deterministic"
							? "Use the deterministic result directly and narrate only the supported consequence."
							: "Narrate from the resolved roll, outcome band, state effects, and contest result rather than inventing unsupported mechanics detail.",
					recommendedFollowUpTools: ["scene_turn", "continuity_audit"],
					writePlan: {
						shouldWrite: appendedEventTypes.length > 0,
						targets: appendedEventTypes.map((eventType) => ({
							path: `${bardoRoot}/events/canonical.ndjson`,
							operation: "append" as const,
							reason: `The ${eventType} event was appended to authoritative canon.`,
						})),
					},
				};
				if (idempotencyKey) {
					await setIdempotentResult({
						bardoRoot,
						key: idempotencyKey,
						scope: "resolve_mechanics",
						result: output,
						nowIso,
					});
				}
				return makeToolResult(output);
			} catch (error) {
				const output: ResolveMechanicsOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to resolve mechanics: ${error.message}`
							: "Failed to resolve mechanics.",
					rootPath: bardoRoot,
					idempotentReplay: false,
					ruleset: resolvedRuleset,
					rulesetTitle: null,
					sourceType: null,
					actionType,
					supportLevel: null,
					targetDifficulty: targetDifficulty ?? null,
					modifier: resolvedModifier,
					advantage: resolvedAdvantage,
					rawRoll: null,
					rolls: [],
					total: null,
					outcome: null,
					margin: null,
					outcomeBand: null,
					contested: null,
					stateEffects: {
						resources: [],
						clocks: [],
					},
					consequencePlan: {
						matchedChains: [],
						branchTransitions: [],
						steps: [],
						decisionNodes: [],
					},
					resolutionMode: "unsupported",
					requiresHumanJudgment: true,
					unsupportedReason: null,
					mechanicsTrace: {},
					appendedEventTypes: [],
					playerFacingSummary:
						"The mechanics request could not be completed safely.",
					gmAdjudication:
						"Revalidate the action inputs or fall back to scene_turn for broader adjudication.",
					recommendedFollowUpTools: [
						"validate_action_against_ruleset",
						"scene_turn",
					],
					writePlan: {
						shouldWrite: false,
						targets: [],
					},
				};
				return makeToolResult(output, true);
			}
		},
	);
}
