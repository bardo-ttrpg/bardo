import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
	type ContextQueryFocus,
	type ContextQueryMode,
	retrieveContext,
} from "../../domain/context/retrieval";
import { resolveBardoRoot } from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";
import {
	decisionGuidanceSchema,
	inferWorkspaceEvidenceSource,
	pickOverallConfidence,
} from "./decision-guidance";

const contextQueryInputSchema = z.object({
	query: z
		.string()
		.max(4_000)
		.default("")
		.describe("Search text for context retrieval and relevance ranking"),
	mode: z
		.enum(["fast", "deep"])
		.default("fast")
		.describe(
			"Retrieval profile: `fast` for lightweight context, `deep` for wider recall",
		),
	focus: z
		.enum(["all", "world", "entities", "quests", "state"])
		.default("all")
		.describe("Directory focus filter"),
	limit: z
		.number()
		.int()
		.min(1)
		.max(50)
		.optional()
		.describe("Max results override. Defaults depend on mode."),
});

const contextQueryOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	rootPath: z.string(),
	indexPath: z.string(),
	mode: z.enum(["fast", "deep"]),
	focus: z.enum(["all", "world", "entities", "quests", "state"]),
	query: z.string(),
	docsIndexed: z.number().int().nonnegative(),
	indexRebuilt: z.boolean(),
	results: z.array(
		z.object({
			relativePath: z.string(),
			title: z.string(),
			sourceDir: z.string(),
			snippet: z.string(),
			bodyChars: z.number().int().nonnegative(),
			matchScore: z.number().int().nonnegative(),
		}),
	),
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
	coverageGaps: z.array(z.string()),
	recommendedNextSteps: decisionGuidanceSchema.shape.recommendedNextSteps,
	riskFlags: decisionGuidanceSchema.shape.riskFlags,
	writePlan: decisionGuidanceSchema.shape.writePlan,
	provenance: decisionGuidanceSchema.shape.provenance,
});

type ContextQueryOutput = z.infer<typeof contextQueryOutputSchema>;

export function registerContextQueryTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"context_query",
		{
			title: "Context Query",
			description:
				"Use this retrieval-only tool to gather canon-backed evidence from the indexed workspace before making a decision or narrating a scene. When to use: when you need grounded facts, citations, coverage gaps, and recommended next reads. When not to use: do not use it to resolve an action or commit world changes; prefer scene_turn for canon-affecting resolution. Example: search for `dock clerk river market` before deciding how an NPC should react.",
			inputSchema: contextQueryInputSchema,
			outputSchema: contextQueryOutputSchema,
			annotations: {
				title: "Context Query",
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ query, mode, focus, limit }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const resolvedMode = mode as ContextQueryMode;
			const resolvedFocus = focus as ContextQueryFocus;
			const resolvedLimit = limit ?? (resolvedMode === "fast" ? 8 : 20);

			try {
				const context = await retrieveContext({
					bardoRoot,
					query,
					mode: resolvedMode,
					focus: resolvedFocus,
					limit: resolvedLimit,
				});

				const output: ContextQueryOutput = {
					success: true,
					message:
						context.results.length > 0
							? "Context retrieved successfully."
							: "Context index refreshed, but no matching records were found.",
					rootPath: bardoRoot,
					indexPath: context.indexPath,
					mode: resolvedMode,
					focus: resolvedFocus,
					query,
					docsIndexed: context.docsIndexed,
					indexRebuilt: context.indexRebuilt,
					results: context.results,
					factsFound: context.results.slice(0, 5).map((result) => ({
						summary: `${result.title}: ${result.snippet}`,
						source: inferWorkspaceEvidenceSource(result.relativePath),
						confidence:
							result.matchScore >= 8
								? "high"
								: result.matchScore >= 3
									? "medium"
									: "low",
						citation: result.relativePath,
					})),
					constraints: [
						"Treat matched snippets as workspace evidence, not automatic canon promotion.",
						"Prefer direct reads of the cited files before making a lasting scene or continuity decision.",
						resolvedFocus === "all"
							? "The search spans the whole workspace corpus."
							: `The search is constrained to the ${resolvedFocus} slice of the workspace index.`,
					],
					unknowns: [
						...(query.trim().length === 0
							? [
									"No search text was supplied, so recall is based on broad corpus relevance only.",
								]
							: []),
						...(context.results.length === 0
							? ["No indexed records matched the current query."]
							: []),
						...(context.results.some((result) => result.matchScore <= 2)
							? [
									"At least one retrieved result has a weak match score and should be corroborated before use.",
								]
							: []),
					],
					confidence: {
						overall: pickOverallConfidence({
							highSignals: context.results.filter(
								(result) => result.matchScore >= 8,
							).length,
							mediumSignals: context.results.filter(
								(result) => result.matchScore >= 3 && result.matchScore < 8,
							).length,
							lowSignals: context.results.filter(
								(result) => result.matchScore < 3,
							).length,
						}),
						grounding:
							context.results.length >= 3
								? "grounded_enough"
								: context.results.length > 0
									? "partially_grounded"
									: "underspecified",
					},
					mustAskUser: context.results.length === 0,
					inferencePolicy:
						context.results.length === 0
							? "must_ask"
							: context.results.some((result) => result.matchScore < 3)
								? "structured_possibilities"
								: "safe_inference",
					commitRecommended: false,
					recommendedFollowUpTools: Array.from(
						new Set(
							(context.results.length > 0
								? ["world_state_overview", "scene_turn"]
								: [
										resolvedMode === "fast"
											? "context_query"
											: "world_state_overview",
									]
							).filter(Boolean),
						),
					),
					recommendedReadTargets: context.results
						.slice(0, 5)
						.map((result) => result.relativePath),
					verificationChecks: [
						{
							name: "retrieval_evidence_strength",
							status:
								context.results.length === 0
									? "failed"
									: context.results.some((result) => result.matchScore < 3)
										? "warning"
										: "passed",
							reason:
								context.results.length === 0
									? "No indexed evidence matched the query, so retrieval cannot ground a confident resolution."
									: context.results.some((result) => result.matchScore < 3)
										? "Some matches are weak and should be corroborated before being treated as reliable support."
										: "The retrieved evidence is strong enough to guide the next read or report step.",
						},
						{
							name: "retrieval_coverage",
							status:
								context.results.length === 0
									? "failed"
									: context.results.length >= 3
										? "passed"
										: "warning",
							reason:
								context.results.length === 0
									? "The current query leaves critical evidence coverage gaps."
									: context.results.length >= 3
										? "Multiple relevant records were retrieved from the workspace index."
										: "Only a narrow slice of workspace evidence was retrieved for this query.",
						},
					],
					coverageGaps:
						context.results.length === 0
							? [
									"No matching indexed evidence was found for the requested fact pattern.",
									"Broader retrieval or direct user clarification is needed before a canon-affecting step.",
								]
							: [],
					recommendedNextSteps:
						context.results.length > 0
							? [
									...context.results.slice(0, 3).map((result) => ({
										action: `Read ${result.relativePath}`,
										reason:
											"Confirm the cited workspace evidence before relying on the retrieval summary.",
									})),
									{
										action:
											"Refresh a high-level report before a major decision",
										reason:
											"Use a world-state or continuity tool when the retrieved snippets suggest broader consequences.",
										tool: "world_state_overview",
									},
								]
							: [
									{
										action: "Broaden the search or switch to a state report",
										reason:
											"No direct evidence matched the query, so a wider context pass is safer than invention.",
										tool:
											resolvedMode === "fast"
												? "context_query"
												: "world_state_overview",
									},
									{
										action:
											"Ask for clarification if the missing fact is outcome-critical",
										reason:
											"The current workspace evidence is too sparse for a confident grounded resolution.",
									},
								],
					riskFlags: [
						...(context.results.length === 0
							? [
									{
										severity: "medium" as const,
										flag: "NO_MATCHES",
										reason:
											"The current query did not return any indexed evidence.",
									},
								]
							: []),
						...(context.results.some((result) => result.matchScore < 3)
							? [
									{
										severity: "low" as const,
										flag: "WEAK_MATCHES",
										reason:
											"Some retrieved snippets have weak relevance and should not drive canon changes on their own.",
									},
								]
							: []),
					],
					writePlan: {
						status: "none",
						shouldWrite: false,
						summary:
							"Context retrieval does not mutate local canon; use it to choose the next read or decision step.",
						targets: [],
					},
					provenance: context.results.slice(0, 5).map((result) => ({
						source: inferWorkspaceEvidenceSource(result.relativePath),
						detail: `Retrieved ${result.title} from the indexed workspace corpus.`,
						confidence:
							result.matchScore >= 8
								? "high"
								: result.matchScore >= 3
									? "medium"
									: "low",
						citation: result.relativePath,
					})),
				};
				return makeToolResult(output);
			} catch (error) {
				const output: ContextQueryOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to query context: ${error.message}`
							: "Failed to query context.",
					rootPath: bardoRoot,
					indexPath: "",
					mode: resolvedMode,
					focus: resolvedFocus,
					query,
					docsIndexed: 0,
					indexRebuilt: false,
					results: [],
					factsFound: [],
					constraints: [
						"Do not invent workspace facts when context retrieval fails.",
					],
					unknowns: [
						"The context index could not be queried, so no grounded retrieval evidence is available.",
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
							name: "retrieval_evidence_strength",
							status: "failed",
							reason:
								"The retrieval layer failed before any workspace evidence could be collected.",
						},
					],
					coverageGaps: [
						"The workspace retrieval index could not be queried successfully.",
					],
					recommendedNextSteps: [
						{
							action:
								"Repair retrieval before continuing with canon-sensitive decisions",
							reason:
								"Without indexed evidence, the agent should avoid promoting new facts into canon.",
						},
					],
					riskFlags: [
						{
							severity: "high",
							flag: "CONTEXT_QUERY_FAILED",
							reason:
								error instanceof Error
									? error.message
									: "The context query failed before any evidence could be retrieved.",
						},
					],
					writePlan: {
						status: "none",
						shouldWrite: false,
						summary:
							"No write should proceed because the retrieval step failed.",
						targets: [],
					},
					provenance: [],
				};
				return makeToolResult(output, true);
			}
		},
	);
}
