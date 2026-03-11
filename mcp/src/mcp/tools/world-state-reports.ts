import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { WorldStateReportId } from "../../domain/reports/workspace-reports";
import { readOrRefreshWorldStateReport } from "../../domain/reports/workspace-reports";
import { resolveBardoRoot } from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const sharedInputSchema = z.object({
	sinceSequence: z
		.number()
		.int()
		.nonnegative()
		.optional()
		.describe(
			"Optional canonical event sequence floor for timeline-style views.",
		),
	playerView: z
		.boolean()
		.optional()
		.describe("Optional hint to keep output player-safe."),
});

const reportOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	reportType: z.string(),
	rootPath: z.string(),
	filePath: z.string(),
	rawMarkdown: z.string(),
});

function registerSingleReportTool(args: {
	server: McpServer;
	auth: AuthContext;
	toolName: string;
	reportId: WorldStateReportId;
	title: string;
	description: string;
}): void {
	args.server.registerTool(
		args.toolName,
		{
			title: args.title,
			description: args.description,
			inputSchema: sharedInputSchema,
			outputSchema: reportOutputSchema,
			annotations: {
				title: args.title,
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ sinceSequence, playerView }) => {
			const bardoRoot = resolveBardoRoot(args.auth.campaignBasePath);
			try {
				const report = await readOrRefreshWorldStateReport({
					bardoRoot,
					reportId: args.reportId,
					options: {
						sinceSequence,
						playerView,
					},
				});
				return makeToolResult({
					success: true,
					message: "Workspace report generated successfully.",
					reportType: args.reportId,
					rootPath: bardoRoot,
					filePath: report.filePath,
					rawMarkdown: report.rawMarkdown,
				});
			} catch (error) {
				return makeToolResult(
					{
						success: false,
						message:
							error instanceof Error
								? `Failed to generate workspace report: ${error.message}`
								: "Failed to generate workspace report.",
						reportType: args.reportId,
						rootPath: bardoRoot,
						filePath: "",
						rawMarkdown: "",
					},
					true,
				);
			}
		},
	);
}

export function registerWorldStateReportTools(
	server: McpServer,
	auth: AuthContext,
): void {
	registerSingleReportTool({
		server,
		auth,
		toolName: "world_state_overview",
		reportId: "world_state_overview",
		title: "World State Overview",
		description:
			"Generate the primary markdown overview of canon-backed world state, active tensions, and evidence.",
	});
	registerSingleReportTool({
		server,
		auth,
		toolName: "continuity_audit",
		reportId: "continuity_audit",
		title: "Continuity Audit",
		description:
			"Generate a markdown continuity audit with evidence, drift findings, and contradictions.",
	});
	registerSingleReportTool({
		server,
		auth,
		toolName: "timeline_diff",
		reportId: "timeline_diff",
		title: "Timeline Diff",
		description:
			"Generate a markdown diff of canonical changes after an optional event sequence boundary.",
	});
	registerSingleReportTool({
		server,
		auth,
		toolName: "last_session_diff",
		reportId: "timeline_diff",
		title: "Last Session Diff",
		description:
			"Generate the readable markdown summary of what changed in the recent canonical window.",
	});
	registerSingleReportTool({
		server,
		auth,
		toolName: "faction_pressure_report",
		reportId: "faction_pressure_report",
		title: "Faction Pressure Report",
		description:
			"Generate a markdown report of faction pressure, conflict, and implied tension.",
	});
	registerSingleReportTool({
		server,
		auth,
		toolName: "npc_state_delta",
		reportId: "npc_state_delta",
		title: "NPC State Delta",
		description:
			"Generate a markdown snapshot of current NPC state and recent NPC evidence.",
	});
	registerSingleReportTool({
		server,
		auth,
		toolName: "player_knowledge_view",
		reportId: "player_knowledge_view",
		title: "Player Knowledge View",
		description:
			"Generate a player-safe markdown view of canon-backed knowledge and unresolved leads.",
	});
	registerSingleReportTool({
		server,
		auth,
		toolName: "canon_vs_inference_report",
		reportId: "canon_vs_inference_report",
		title: "Canon Vs Inference Report",
		description:
			"Generate a markdown report separating canon, inference, and suggestion explicitly.",
	});
}
