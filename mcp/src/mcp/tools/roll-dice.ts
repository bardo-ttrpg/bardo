import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { appendCanonicalEvent } from "../../domain/events/store";
import {
	getIdempotentResult,
	setIdempotentResult,
} from "../../domain/idempotency/store";
import { rollDiceExpression } from "../../domain/mechanics/dice";
import { resolveBardoRoot } from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const rollDiceInputSchema = z.object({
	expression: z
		.string()
		.trim()
		.min(3)
		.max(64)
		.describe("Dice expression in NdM[+K|-K] format (for example `1d20+5`)."),
	reason: z
		.string()
		.trim()
		.max(240)
		.optional()
		.describe("Optional short reason/context for this roll."),
	idempotencyKey: z
		.string()
		.trim()
		.min(8)
		.max(256)
		.optional()
		.describe("Optional idempotency key to safely replay same roll result."),
});

const rollDiceOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	rootPath: z.string(),
	idempotentReplay: z.boolean(),
	roll: z.object({
		expression: z.string(),
		diceCount: z.number().int().positive(),
		diceSides: z.number().int().positive(),
		modifier: z.number().int(),
		rolls: z.array(z.number().int().positive()),
		subtotal: z.number().int(),
		total: z.number().int(),
		minPossible: z.number().int(),
		maxPossible: z.number().int(),
	}),
});

type RollDiceOutput = z.infer<typeof rollDiceOutputSchema>;

function canonicalRollDiceEventId(idempotencyKey: string | undefined): string {
	if (!idempotencyKey) {
		return `evt-dice-rolled-${crypto.randomUUID()}`;
	}
	const normalized = idempotencyKey
		.toLowerCase()
		.replaceAll(/[^a-z0-9_-]/g, "-")
		.slice(0, 80);
	return `evt-dice-rolled-${normalized}`;
}

export function registerRollDiceTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"roll_dice",
		{
			title: "Roll Dice",
			description:
				"Authoritative deterministic dice roller. Appends a canonical `dice_rolled` event.",
			inputSchema: rollDiceInputSchema,
			outputSchema: rollDiceOutputSchema,
			annotations: {
				title: "Roll Dice",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async ({ expression, reason, idempotencyKey }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			try {
				if (idempotencyKey) {
					const replay = await getIdempotentResult({
						bardoRoot,
						key: idempotencyKey,
						scope: "roll_dice",
					});
					if (replay) {
						return makeToolResult({
							...(replay as RollDiceOutput),
							idempotentReplay: true,
						});
					}
				}

				const rolled = rollDiceExpression({ expression });
				const nowIso = new Date().toISOString();
				await appendCanonicalEvent({
					bardoRoot,
					event: {
						id: canonicalRollDiceEventId(idempotencyKey),
						type: "dice_rolled",
						atISO: nowIso,
						source: "roll_dice",
						data: {
							expression: rolled.normalizedExpression,
							diceCount: rolled.diceCount,
							diceSides: rolled.diceSides,
							modifier: rolled.modifier,
							rolls: rolled.rolls,
							subtotal: rolled.subtotal,
							total: rolled.total,
							reason: reason ?? null,
						},
					},
				});

				const output: RollDiceOutput = {
					success: true,
					message: "Dice rolled successfully.",
					rootPath: bardoRoot,
					idempotentReplay: false,
					roll: {
						expression: rolled.normalizedExpression,
						diceCount: rolled.diceCount,
						diceSides: rolled.diceSides,
						modifier: rolled.modifier,
						rolls: rolled.rolls,
						subtotal: rolled.subtotal,
						total: rolled.total,
						minPossible: rolled.minPossible,
						maxPossible: rolled.maxPossible,
					},
				};

				if (idempotencyKey) {
					await setIdempotentResult({
						bardoRoot,
						key: idempotencyKey,
						scope: "roll_dice",
						result: output,
						nowIso,
					});
				}
				return makeToolResult(output);
			} catch (error) {
				const output: RollDiceOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to roll dice: ${error.message}`
							: "Failed to roll dice.",
					rootPath: bardoRoot,
					idempotentReplay: false,
					roll: {
						expression: "",
						diceCount: 1,
						diceSides: 20,
						modifier: 0,
						rolls: [],
						subtotal: 0,
						total: 0,
						minPossible: 0,
						maxPossible: 0,
					},
				};
				return makeToolResult(output, true);
			}
		},
	);
}
