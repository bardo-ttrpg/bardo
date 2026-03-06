import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";
import { runConsistencyCheck } from "./consistency-check";
import { runPlayerAction } from "./player-action/register";
import { gmPacketSchema } from "./player-action/schemas";
import { runWorldSync } from "./world-sync/register";

const sceneTurnInputSchema = z.object({
	action: z.string().min(1).max(1_000),
	transcript: z.string().min(1).max(40_000).optional(),
	idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

const sceneTurnOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	gmPacket: gmPacketSchema,
	actionResult: z.object({
		locationAfter: z.string(),
	}),
	consistency: z.object({
		success: z.boolean(),
		errorCount: z.number().int().nonnegative(),
	}),
});

const emptyGmPacket = {
	sceneFrame: {
		locationId: "",
		locationName: "",
		summary: "",
		activeSituation: "",
		exits: [],
		sensoryCues: [],
		unresolvedQuestions: [],
	},
	resolution: {
		intent: "general",
		fiction: "",
		mechanicsSummary: "",
		outcome: "mixed",
	},
	narrativeBeats: [],
	npcReactions: [],
	discoveries: [],
	consequences: {
		timeAdvancedMinutes: 0,
		worldTimeAfterISO: new Date(0).toISOString(),
		locationAfter: "",
		clocksAdvanced: [],
		threadsActivated: [],
	},
	followUps: [],
	safetyNotes: [],
	renderingHints: {
		tone: "neutral",
		pacing: "steady",
		revealLevel: "minimal",
		rulesTransparency: "explicit",
	},
} satisfies z.infer<typeof gmPacketSchema>;

export function registerSceneTurnTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"scene_turn",
		{
			title: "Resolve Scene Turn",
			description:
				"Primary high-level GM runtime tool. Resolves the player action, syncs discoveries, refreshes canon, and returns a structured GM packet for narration.",
			inputSchema: sceneTurnInputSchema,
			outputSchema: sceneTurnOutputSchema,
			annotations: {
				title: "Resolve Scene Turn",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: true,
			},
		},
		async ({ action, transcript, idempotencyKey }) => {
			try {
				const actionResult = await runPlayerAction({
					auth,
					action,
					idempotencyKey: idempotencyKey
						? `${idempotencyKey}::action`
						: undefined,
				});
				const syncResult =
					transcript || actionResult.discoveryCandidates.length > 0
						? await runWorldSync({
								auth,
								transcript,
								currentLocationHint: actionResult.locationAfter,
								discoveries: actionResult.discoveryCandidates.map(
									(candidate) => ({
										kind: candidate.kind,
										id: candidate.id,
										displayName: candidate.displayName,
										discoveryMode: candidate.discoveryMode,
										confidence: candidate.confidence,
										summary: candidate.summary,
										metadata: candidate.metadata,
										persisted: candidate.persisted,
									}),
								),
							})
						: null;
				const consistency = await runConsistencyCheck({
					auth,
					includeWarnings: true,
				});
				const discoveries = syncResult?.persistedDiscoveries.length
					? syncResult.persistedDiscoveries
					: actionResult.gmPacket.discoveries;
				const output = {
					success:
						actionResult.success &&
						(syncResult?.success ?? true) &&
						consistency.success,
					message: actionResult.message,
					gmPacket: {
						...actionResult.gmPacket,
						discoveries,
					},
					actionResult: {
						locationAfter: actionResult.locationAfter,
					},
					consistency: {
						success: consistency.success,
						errorCount: consistency.errorCount,
					},
				};
				return makeToolResult(output, !output.success);
			} catch (error) {
				return makeToolResult(
					{
						success: false,
						message:
							error instanceof Error
								? `Failed to resolve scene turn: ${error.message}`
								: "Failed to resolve scene turn.",
						gmPacket: emptyGmPacket,
						actionResult: {
							locationAfter: "",
						},
						consistency: {
							success: false,
							errorCount: 1,
						},
					},
					true,
				);
			}
		},
	);
}
