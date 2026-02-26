import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { replayCanonicalEvents } from "../../domain/events/store";
import {
	resolveBardoRoot,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const replayEventsInputSchema = z.object({
	fromSequence: z
		.number()
		.int()
		.min(1)
		.default(1)
		.describe("1-based starting sequence to replay from."),
	limit: z
		.number()
		.int()
		.min(1)
		.max(500)
		.default(100)
		.describe("Maximum number of events to return."),
});

const replayEventsOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	rootPath: z.string(),
	eventLogPath: z.string(),
	totalEvents: z.number().int().nonnegative(),
	returnedEvents: z.number().int().nonnegative(),
	fromSequence: z.number().int().positive(),
	limit: z.number().int().positive(),
	events: z.array(
		z.object({
			id: z.string(),
			sequence: z.number().int().positive(),
			type: z.string(),
			atISO: z.string(),
			source: z.string(),
			data: z.record(z.string(), z.unknown()),
		}),
	),
});

type ReplayEventsOutput = z.infer<typeof replayEventsOutputSchema>;

export function registerReplayEventsTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"replay_events",
		{
			title: "Replay Canonical Events",
			description:
				"Read canonical events from the append-only event log in sequence order.",
			inputSchema: replayEventsInputSchema,
			outputSchema: replayEventsOutputSchema,
			annotations: {
				title: "Replay Canonical Events",
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ fromSequence, limit }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const eventLogPath = resolvePathInsideRoot(
				bardoRoot,
				"events/canonical.ndjson",
			);
			try {
				const all = await replayCanonicalEvents({ bardoRoot });
				const startIndex = fromSequence - 1;
				const events = all.slice(startIndex, startIndex + limit);
				const output: ReplayEventsOutput = {
					success: true,
					message: "Canonical events replayed successfully.",
					rootPath: bardoRoot,
					eventLogPath,
					totalEvents: all.length,
					returnedEvents: events.length,
					fromSequence,
					limit,
					events,
				};
				return makeToolResult(output);
			} catch (error) {
				const output: ReplayEventsOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to replay events: ${error.message}`
							: "Failed to replay events.",
					rootPath: bardoRoot,
					eventLogPath,
					totalEvents: 0,
					returnedEvents: 0,
					fromSequence,
					limit,
					events: [],
				};
				return makeToolResult(output, true);
			}
		},
	);
}
