import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { replayCanonicalEvents } from "../../domain/events/store";
import {
	CURRENT_STATE_PROJECTION_ID,
	deriveCurrentStateFromEvents,
	regenerateCurrentStateProjection,
} from "../../domain/projections/current-state";
import { resolveBardoRoot } from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const regenerateProjectionInputSchema = z.object({
	projectionId: z
		.literal(CURRENT_STATE_PROJECTION_ID)
		.default(CURRENT_STATE_PROJECTION_ID)
		.describe("Projection identifier. Currently supports `current_state`."),
	dryRun: z
		.boolean()
		.default(false)
		.describe("Build projection payload without writing projection files."),
});

const regenerateProjectionOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	rootPath: z.string(),
	projectionId: z.literal(CURRENT_STATE_PROJECTION_ID),
	projectionPath: z.string(),
	dryRun: z.boolean(),
	eventCount: z.number().int().nonnegative(),
	state: z.record(z.string(), z.unknown()),
});

type RegenerateProjectionOutput = z.infer<
	typeof regenerateProjectionOutputSchema
>;

export function registerRegenerateProjectionTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"regenerate_projection",
		{
			title: "Regenerate Projection",
			description:
				"Regenerate derived projections from canonical events. Supports `current_state`.",
			inputSchema: regenerateProjectionInputSchema,
			outputSchema: regenerateProjectionOutputSchema,
			annotations: {
				title: "Regenerate Projection",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ projectionId, dryRun }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			try {
				if (projectionId !== CURRENT_STATE_PROJECTION_ID) {
					throw new Error(
						`Unsupported projectionId '${projectionId}'. Supported: current_state.`,
					);
				}

				if (dryRun) {
					const events = await replayCanonicalEvents({ bardoRoot });
					const state = deriveCurrentStateFromEvents(events);
					const output: RegenerateProjectionOutput = {
						success: true,
						message: "Projection dry-run succeeded.",
						rootPath: bardoRoot,
						projectionId: CURRENT_STATE_PROJECTION_ID,
						projectionPath: "",
						dryRun: true,
						eventCount: events.length,
						state,
					};
					return makeToolResult(output);
				}

				const projection = await regenerateCurrentStateProjection({
					bardoRoot,
				});
				const output: RegenerateProjectionOutput = {
					success: true,
					message: "Projection regenerated successfully.",
					rootPath: bardoRoot,
					projectionId: projection.projectionId,
					projectionPath: projection.projectionPath,
					dryRun: false,
					eventCount: projection.eventCount,
					state: projection.state,
				};
				return makeToolResult(output);
			} catch (error) {
				const output: RegenerateProjectionOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to regenerate projection: ${error.message}`
							: "Failed to regenerate projection.",
					rootPath: bardoRoot,
					projectionId: CURRENT_STATE_PROJECTION_ID,
					projectionPath: "",
					dryRun,
					eventCount: 0,
					state: {},
				};
				return makeToolResult(output, true);
			}
		},
	);
}
