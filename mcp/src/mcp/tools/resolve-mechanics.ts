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
	actionType: z.string(),
	targetDifficulty: z.number().int().nullable(),
	modifier: z.number().int(),
	advantage: z.enum(["none", "advantage", "disadvantage"]).nullable(),
	rawRoll: z.number().int().min(1).max(20).nullable(),
	rolls: z.array(z.number().int().min(1).max(20)),
	total: z.number().int().nullable(),
	outcome: z.enum(["success", "failure"]).nullable(),
	margin: z.number().int().nullable(),
	resolutionMode: z.enum(["dice", "deterministic", "unsupported"]),
	unsupportedReason: z.string().nullable(),
	mechanicsTrace: z.record(z.string(), z.unknown()),
	appendedEventTypes: z.array(z.string()),
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
				"Resolve mechanics using the selected ruleset adapter and append canonical mechanics events.",
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
			modifier,
			advantage,
			actorId,
			declaredIntent,
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

				const adapter = resolveRulesetAdapter(resolvedRuleset);
				const resolution = adapter.resolve({
					actionType,
					targetDifficulty,
					modifier: resolvedModifier,
					advantage: resolvedAdvantage,
					actorId,
					declaredIntent,
				});

				const outputBase: Omit<
					ResolveMechanicsOutput,
					"success" | "message" | "idempotentReplay" | "appendedEventTypes"
				> = {
					rootPath: bardoRoot,
					ruleset: adapter.id,
					actionType: resolution.actionType,
					targetDifficulty: resolution.targetDifficulty,
					modifier: resolution.modifier,
					advantage: resolution.advantage,
					rawRoll: resolution.rawRoll,
					rolls: resolution.rolls,
					total: resolution.total,
					outcome: resolution.outcome,
					margin: resolution.margin,
					resolutionMode: resolution.resolutionMode,
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
					};
					return makeToolResult(unsupportedOutput, true);
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
					actionType,
					targetDifficulty: targetDifficulty ?? null,
					modifier: resolvedModifier,
					advantage: resolvedAdvantage,
					rawRoll: null,
					rolls: [],
					total: null,
					outcome: null,
					margin: null,
					resolutionMode: "unsupported",
					unsupportedReason: null,
					mechanicsTrace: {},
					appendedEventTypes: [],
				};
				return makeToolResult(output, true);
			}
		},
	);
}
