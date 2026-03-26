import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { WorldStateReportId } from "../../domain/reports/workspace-reports";
import { readOrRefreshWorldStateReport } from "../../domain/reports/workspace-reports";
import { resolveBardoRoot } from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";
import {
	decisionGuidanceSchema,
	extractMarkdownSectionBullets,
	inferUnknownsFromText,
	pickOverallConfidence,
} from "./decision-guidance";

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
	factsFound: decisionGuidanceSchema.shape.factsFound,
	constraints: decisionGuidanceSchema.shape.constraints,
	unknowns: decisionGuidanceSchema.shape.unknowns,
	confidence: decisionGuidanceSchema.shape.confidence,
	mustAskUser: decisionGuidanceSchema.shape.mustAskUser,
	inferencePolicy: decisionGuidanceSchema.shape.inferencePolicy,
	commitRecommended: decisionGuidanceSchema.shape.commitRecommended,
	recommendedFollowUpTools:
		decisionGuidanceSchema.shape.recommendedFollowUpTools,
	recommendedReadTargets: decisionGuidanceSchema.shape.recommendedReadTargets,
	verificationChecks: decisionGuidanceSchema.shape.verificationChecks,
	recommendedNextSteps: decisionGuidanceSchema.shape.recommendedNextSteps,
	riskFlags: decisionGuidanceSchema.shape.riskFlags,
	writePlan: decisionGuidanceSchema.shape.writePlan,
	provenance: decisionGuidanceSchema.shape.provenance,
	safeToProceed: z.boolean(),
	driftSeverity: z.enum(["none", "low", "medium", "high"]),
});

function buildReportGuidance(args: {
	reportId: WorldStateReportId;
	filePath: string;
	rawMarkdown: string;
	playerView?: boolean;
}) {
	const canonLines = extractMarkdownSectionBullets(args.rawMarkdown, "Canon");
	const inferenceLines = extractMarkdownSectionBullets(
		args.rawMarkdown,
		"Inference",
	);
	const suggestionLines = extractMarkdownSectionBullets(
		args.rawMarkdown,
		"Suggestion",
	);
	const unknowns = [
		...inferUnknownsFromText(canonLines),
		...inferUnknownsFromText(inferenceLines),
	];
	const reportSpecificSteps =
		args.reportId === "continuity_audit"
			? [
					{
						action: "Review flagged drift before continuing play",
						reason:
							"Continuity findings should be resolved before new canon compounds the inconsistency.",
						tool: "continuity_audit",
					},
				]
			: args.reportId === "timeline_diff"
				? [
						{
							action:
								"Inspect the listed event ids when a change needs exact grounding",
							reason:
								"Timeline diffs are most useful when paired with the exact canonical events they summarize.",
						},
					]
				: args.reportId === "player_knowledge_view"
					? [
							{
								action: "Narrate only what the player-safe section supports",
								reason:
									"This report is designed to keep GM-only inferences out of table-facing narration.",
							},
						]
					: [
							{
								action:
									"Use this report as the current grounded summary before major decisions",
								reason:
									"The report condenses the latest canon-backed state into a fast decision surface.",
							},
						];
	const riskFlags = [
		...inferenceLines
			.filter((line) =>
				/\b(contradiction|drift|warning|error|conflict|stale|none|no )\b/i.test(
					line,
				),
			)
			.map((line) => ({
				severity:
					args.reportId === "continuity_audit" &&
					/\b(error|contradiction|conflict)\b/i.test(line)
						? ("high" as const)
						: ("medium" as const),
				flag:
					args.reportId === "continuity_audit"
						? "CONTINUITY_REVIEW"
						: "REPORT_REVIEW",
				reason: line,
			})),
	];
	const grounding =
		canonLines.length >= 3
			? "grounded_enough"
			: canonLines.length > 0
				? "partially_grounded"
				: "underspecified";
	const driftSeverity = riskFlags.some((flag) => flag.severity === "high")
		? "high"
		: args.reportId === "continuity_audit" &&
				riskFlags.some((flag) => flag.severity === "medium")
			? "medium"
			: canonLines.length > 0 || inferenceLines.length > 0
				? "low"
				: "none";
	const mustAskUser =
		grounding === "underspecified" ||
		(args.reportId === "continuity_audit" && driftSeverity === "high");
	const recommendedFollowUpTools = Array.from(
		new Set(
			[
				"scene_turn",
				args.reportId === "continuity_audit" ? null : "continuity_audit",
				args.reportId === "player_knowledge_view"
					? null
					: "player_knowledge_view",
			].filter((value): value is string => Boolean(value)),
		),
	);
	const recommendedReadTargets = Array.from(
		new Set([args.filePath, "events/canonical.ndjson"]),
	);
	const verificationChecks = [
		{
			name: "report_evidence_coverage",
			status:
				grounding === "grounded_enough"
					? ("passed" as const)
					: grounding === "partially_grounded"
						? ("warning" as const)
						: ("failed" as const),
			reason:
				grounding === "grounded_enough"
					? "The report contains enough canon-backed evidence to guide the next action."
					: grounding === "partially_grounded"
						? "The report contains some canon evidence, but it would benefit from corroborating reads."
						: "The report does not contain enough canon-backed evidence to guide a safe next action by itself.",
		},
		{
			name: "report_drift_scan",
			status:
				driftSeverity === "high"
					? ("failed" as const)
					: driftSeverity === "medium"
						? ("warning" as const)
						: ("passed" as const),
			reason:
				driftSeverity === "high"
					? "The report surfaced severe contradiction or drift signals."
					: driftSeverity === "medium"
						? "The report surfaced review-worthy drift or inference signals."
						: "No severe drift signal was surfaced by this report refresh.",
		},
	];

	return {
		factsFound: canonLines.map((line) => ({
			summary: line,
			source: "canonical" as const,
			confidence: "high" as const,
			citation: args.filePath,
		})),
		constraints: [
			"Treat the report's Canon section as authoritative current truth for decision-making.",
			"Review inference bullets before turning them into new lasting canon.",
			...(args.playerView
				? [
						"Keep GM-only knowledge out of player-facing narration while using this report.",
					]
				: []),
		],
		unknowns:
			unknowns.length > 0
				? unknowns
				: [
						"Inference sections may still contain reviewable conclusions that need explicit confirmation before canon promotion.",
					],
		confidence: {
			overall: pickOverallConfidence({
				highSignals: canonLines.length,
				mediumSignals: suggestionLines.length,
				lowSignals: unknowns.length,
			}),
			grounding,
		},
		mustAskUser,
		inferencePolicy: mustAskUser ? "must_ask" : "safe_inference",
		commitRecommended: false,
		recommendedFollowUpTools,
		recommendedReadTargets,
		verificationChecks,
		recommendedNextSteps: [
			...reportSpecificSteps,
			...suggestionLines.map((line) => ({
				action: line,
				reason:
					"The report itself surfaced this as the safest natural follow-up.",
			})),
		],
		riskFlags,
		writePlan: {
			status: "already_applied" as const,
			shouldWrite: true,
			summary:
				"This report tool refreshed a derived markdown artifact without mutating canonical events.",
			targets: [
				{
					path: args.filePath,
					operation: "refresh" as const,
					reason:
						"The report file was regenerated to reflect the latest current-state evidence.",
				},
			],
		},
		provenance: [
			{
				source: "canonical" as const,
				detail:
					"The report was regenerated from local campaign files and canonical event history.",
				confidence: "high" as const,
				citation: args.filePath,
			},
			...(inferenceLines.length > 0
				? [
						{
							source: "inferred" as const,
							detail: `${String(inferenceLines.length)} inference bullet(s) are included and should be reviewed before canon promotion.`,
							confidence: "medium" as const,
							citation: args.filePath,
						},
					]
				: []),
		],
		safeToProceed:
			grounding !== "underspecified" &&
			!(args.reportId === "continuity_audit" && driftSeverity === "high"),
		driftSeverity,
	};
}

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
			description: `${args.description} When to use: when you need a grounded report, audit, or player-safe summary before narrating or resolving the next step. When not to use: do not use this as generic file access or to commit canon changes; use scene_turn for action resolution. Example: refresh this report before deciding whether recent events created drift, new pressure, or player-visible consequences.`,
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
					...buildReportGuidance({
						reportId: args.reportId,
						filePath: report.filePath,
						rawMarkdown: report.rawMarkdown,
						playerView,
					}),
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
						factsFound: [],
						constraints: [
							"Do not rely on a stale report when regeneration fails.",
						],
						unknowns: [
							"The report could not be refreshed, so no grounded report evidence is available.",
						],
						confidence: {
							overall: "low",
							grounding: "underspecified",
						},
						mustAskUser: true,
						inferencePolicy: "must_ask",
						commitRecommended: false,
						recommendedFollowUpTools: ["context_query"],
						recommendedReadTargets: [],
						verificationChecks: [
							{
								name: "report_evidence_coverage",
								status: "failed",
								reason:
									"Report generation failed before any derived evidence could be produced.",
							},
						],
						recommendedNextSteps: [
							{
								action:
									"Repair report generation before using this view for canon-sensitive decisions",
								reason:
									"A failed report refresh leaves the agent without a trustworthy derived summary.",
							},
						],
						riskFlags: [
							{
								severity: "high",
								flag: "REPORT_GENERATION_FAILED",
								reason:
									error instanceof Error
										? error.message
										: "Workspace report generation failed.",
							},
						],
						writePlan: {
							status: "none",
							shouldWrite: false,
							summary:
								"No write should proceed because report generation failed.",
							targets: [],
						},
						provenance: [],
						safeToProceed: false,
						driftSeverity: "high",
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
		toolName: "player_knowledge_view",
		reportId: "player_knowledge_view",
		title: "Player Knowledge View",
		description:
			"Generate a player-safe markdown view of canon-backed knowledge and unresolved leads.",
	});
}
