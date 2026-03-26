import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";
import { runConsistencyCheck } from "./consistency-check";
import {
	decisionGuidanceSchema,
	pickOverallConfidence,
} from "./decision-guidance";
import { runPlayerAction } from "./player-action/register";
import { gmPacketSchema } from "./player-action/schemas";
import { runWorldSync } from "./world-sync/register";

const sceneTurnInputSchema = z.object({
	action: z.string().min(1).max(1_000),
	transcript: z.string().min(1).max(40_000).optional(),
	idempotencyKey: z.string().trim().min(8).max(200).optional(),
	skipWorldSync: z.boolean().optional(),
});

const sceneTurnOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	gmPacket: gmPacketSchema,
	requiresSetup: z.boolean(),
	setupStatus: z.enum(["needs_input", "complete", "error", "locked"]),
	setupQuestionKey: z.union([z.string(), z.null()]),
	setupQuestion: z.union([z.string(), z.null()]),
	setupWarnings: z.array(z.string()),
	pendingAction: z.union([z.string(), z.null()]),
	actionResult: z.object({
		locationAfter: z.string(),
	}),
	consistency: z.object({
		success: z.boolean(),
		errorCount: z.number().int().nonnegative(),
	}),
	groundingStatus: decisionGuidanceSchema.shape.confidence.shape.grounding,
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
				"Use this as the primary canon-affecting action-resolution tool. When to use: when a player action should be resolved against current workspace truth, verified for continuity, and turned into a write-aware GM packet. When not to use: do not use it for simple retrieval or passive reporting; prefer context_query for evidence lookup and the report tools for audits and summaries. Example: resolve `I enter the tavern and ask the barkeep their name.` before narrating the next scene beat.",
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
		async ({ action, transcript, idempotencyKey, skipWorldSync }) => {
			try {
				const previewActionResult = await runPlayerAction({
					auth,
					action,
					idempotencyKey: idempotencyKey
						? `${idempotencyKey}::action`
						: undefined,
					dryRun: true,
				});
				const shouldCommitAction =
					!previewActionResult.requiresSetup &&
					!(previewActionResult.intent === "social" && !transcript);
				const actionResult = shouldCommitAction
					? await runPlayerAction({
							auth,
							action,
							idempotencyKey: idempotencyKey
								? `${idempotencyKey}::action`
								: undefined,
						})
					: previewActionResult;
				const syncResult =
					!skipWorldSync &&
					(transcript || actionResult.discoveryCandidates.length > 0)
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
								dryRun: !shouldCommitAction,
							})
						: null;
				const commitApplied = shouldCommitAction;
				const consistency = await runConsistencyCheck({
					auth,
					includeWarnings: true,
				});
				const discoveries = syncResult?.persistedDiscoveries.length
					? syncResult.persistedDiscoveries
					: actionResult.gmPacket.discoveries;
				const needsSocialGrounding =
					!transcript && actionResult.intent === "social";
				const groundingStatus =
					actionResult.requiresSetup || needsSocialGrounding
						? "underspecified"
						: actionResult.completeness.contextReady &&
								actionResult.confidence.narration !== "low" &&
								consistency.success
							? "grounded_enough"
							: "partially_grounded";
				const playerKnowledgeLeakDetected = [
					actionResult.gmPacket.resolution.fiction,
					...actionResult.gmPacket.narrativeBeats,
					...actionResult.gmPacket.safetyNotes,
				].some((line) =>
					/\b(secretly|unbeknownst|gm-only|hidden from the players|off-screen truth)\b/i.test(
						line,
					),
				);
				const unsupportedInferencePromotion =
					discoveries.some(
						(discovery) =>
							discovery.persisted &&
							discovery.discoveryMode !== "explicitly_named" &&
							discovery.confidence === "low",
					) || actionResult.confidence.discoveries === "low";
				const writeTargets = [
					{
						path: actionResult.historyPath,
						operation: "append" as const,
						reason:
							"The resolved scene turn was appended to the canonical event history.",
					},
					{
						path: actionResult.statePath,
						operation: "update" as const,
						reason:
							"The local state mirror was updated to reflect the post-turn world state.",
					},
					{
						path: `${actionResult.rootPath}/projections/current-state.md`,
						operation: "refresh" as const,
						reason:
							"The canon-derived projection should stay aligned with the committed turn outcome.",
					},
				];
				const verificationChecks = [
					{
						name: "continuity_contradiction_check",
						status: consistency.success ? "passed" : "failed",
						reason: consistency.success
							? "The post-turn continuity pass did not find hard contradictions."
							: `The post-turn continuity check reported ${String(consistency.errorCount)} error(s).`,
					},
					{
						name: "player_knowledge_leak_check",
						status: playerKnowledgeLeakDetected ? "failed" : "passed",
						reason: playerKnowledgeLeakDetected
							? "The GM packet appears to expose hidden or GM-only knowledge in player-facing language."
							: "No obvious hidden-knowledge leak was detected in the generated turn packet.",
					},
					{
						name: "unsupported_inference_promotion_check",
						status: unsupportedInferencePromotion
							? groundingStatus === "underspecified"
								? "failed"
								: "warning"
							: "passed",
						reason: unsupportedInferencePromotion
							? "The turn includes inferred discoveries that should not be treated as fully established canon without follow-up confirmation."
							: "No low-confidence inferred facts were promoted into canon-sensitive outputs.",
					},
					{
						name: "write_plan_sanity_check",
						status:
							writeTargets.length === 3 &&
							new Set(writeTargets.map((target) => target.path)).size ===
								writeTargets.length
								? "passed"
								: "failed",
						reason:
							writeTargets.length === 3 &&
							new Set(writeTargets.map((target) => target.path)).size ===
								writeTargets.length
								? "The scene turn write plan targets are unique and cover history, state, and projection refresh."
								: "The scene turn write plan is missing a required target or contains duplicates.",
					},
					{
						name: "setup_completeness_check",
						status: actionResult.requiresSetup ? "failed" : "passed",
						reason: actionResult.requiresSetup
							? "Setup still requires user input before this turn should be treated as fully grounded."
							: "The scene turn did not report any blocking setup requirement.",
					},
				] as const;
				const mustAskUser =
					actionResult.requiresSetup ||
					groundingStatus !== "grounded_enough" ||
					needsSocialGrounding;
				const commitRecommended =
					actionResult.success &&
					(syncResult?.success ?? true) &&
					!needsSocialGrounding &&
					verificationChecks.every((check) => check.status === "passed") &&
					groundingStatus === "grounded_enough";
				const blockedCommit =
					actionResult.success &&
					(syncResult?.success ?? true) &&
					!commitApplied;
				const effectiveSuccess =
					actionResult.success &&
					(syncResult?.success ?? true) &&
					(blockedCommit ||
						(consistency.success && !playerKnowledgeLeakDetected));
				const recommendedFollowUpTools = Array.from(
					new Set(
						[
							"world_state_overview",
							"continuity_audit",
							actionResult.requiresSetup ? null : "player_knowledge_view",
						].filter((value): value is string => Boolean(value)),
					),
				);
				const recommendedReadTargets = Array.from(
					new Set([
						actionResult.historyPath,
						actionResult.statePath,
						`${actionResult.rootPath}/projections/current-state.md`,
					]),
				);
				const output = {
					success: effectiveSuccess,
					message: actionResult.message,
					gmPacket: {
						...actionResult.gmPacket,
						discoveries,
					},
					requiresSetup: actionResult.requiresSetup,
					setupStatus: actionResult.setupStatus,
					setupQuestionKey: actionResult.setupQuestionKey,
					setupQuestion: actionResult.setupQuestion,
					setupWarnings: actionResult.setupWarnings,
					pendingAction: actionResult.pendingAction,
					actionResult: {
						locationAfter: actionResult.locationAfter,
					},
					consistency: {
						success: consistency.success,
						errorCount: consistency.errorCount,
					},
					groundingStatus,
					factsFound: [
						{
							summary: `Action intent classified as ${actionResult.intent}.`,
							source: "canonical" as const,
							confidence: "high" as const,
							citation: actionResult.historyPath,
						},
						{
							summary: `Scene moved from ${actionResult.locationBefore} to ${actionResult.locationAfter}.`,
							source: "canonical" as const,
							confidence: "high" as const,
							citation: actionResult.statePath,
						},
						{
							summary: `World time advanced by ${String(actionResult.timeAdvancedMinutes)} minute(s) to ${actionResult.worldTimeAfterISO}.`,
							source: "canonical" as const,
							confidence: "high" as const,
							citation: actionResult.statePath,
						},
						...discoveries.slice(0, 6).map((discovery) => ({
							summary: `${discovery.displayName} surfaced as a ${discovery.kind}.`,
							source:
								discovery.discoveryMode === "explicitly_named"
									? ("canonical" as const)
									: ("inferred" as const),
							confidence: discovery.confidence,
							citation: actionResult.statePath,
						})),
						...(actionResult.mechanics.required
							? [
									{
										summary: actionResult.mechanics.resolved
											? `Mechanics resolved via ${actionResult.mechanics.resolutionMode ?? "unknown"} with outcome ${actionResult.mechanics.outcome ?? "unknown"}.`
											: "Mechanics were relevant but not fully resolved by the ruleset adapter.",
										source: "canonical" as const,
										confidence: actionResult.mechanics.resolved
											? ("high" as const)
											: ("medium" as const),
										citation: actionResult.historyPath,
									},
								]
							: []),
					],
					constraints: [
						...actionResult.narrationGuardrails,
						"Do not promote inferred discoveries into lasting canon unless they were persisted by the tool flow.",
						...(actionResult.mechanics.required &&
						!actionResult.mechanics.resolved
							? [
									"Keep the narration conservative because the mechanics layer did not fully resolve the requested action.",
								]
							: []),
					],
					unknowns: [
						...actionResult.gmPacket.sceneFrame.unresolvedQuestions,
						...actionResult.setupWarnings,
						...(actionResult.requiresSetup && actionResult.setupQuestion
							? [`Setup still needs user input: ${actionResult.setupQuestion}`]
							: []),
						...(actionResult.mechanics.unsupportedReason
							? [actionResult.mechanics.unsupportedReason]
							: []),
						...(!actionResult.completeness.contextReady
							? [
									"The action resolved without a fully warm context bundle, so downstream continuity checks deserve extra scrutiny.",
								]
							: []),
						...(needsSocialGrounding
							? [
									"The scene lacks a grounding transcript for a social exchange, so the safest continuation is to confirm the NPC response before treating it as settled canon.",
								]
							: []),
					],
					confidence: {
						overall: pickOverallConfidence({
							highSignals: [
								actionResult.confidence.narration === "high",
								actionResult.confidence.discoveries === "high",
								actionResult.completeness.contextReady,
								consistency.success,
							].filter(Boolean).length,
							mediumSignals: [
								actionResult.confidence.narration === "medium",
								actionResult.confidence.discoveries === "medium",
								actionResult.mechanics.required &&
									!actionResult.mechanics.resolved,
							].filter(Boolean).length,
							lowSignals: [
								actionResult.confidence.narration === "low",
								actionResult.confidence.discoveries === "low",
								actionResult.requiresSetup,
								!consistency.success,
							].filter(Boolean).length,
						}),
						grounding: groundingStatus,
					},
					mustAskUser,
					inferencePolicy: actionResult.requiresSetup
						? "must_ask"
						: needsSocialGrounding
							? "must_ask"
							: unsupportedInferencePromotion ||
									(actionResult.mechanics.required &&
										!actionResult.mechanics.resolved)
								? "structured_possibilities"
								: "safe_inference",
					commitRecommended,
					recommendedFollowUpTools,
					recommendedReadTargets,
					verificationChecks,
					recommendedNextSteps: [
						...actionResult.gmPacket.followUps.map((followUp) => ({
							action: followUp,
							reason:
								"The GM packet identified this as a natural continuation from the resolved scene state.",
						})),
						...(actionResult.requiresSetup
							? [
									{
										action:
											"Ask the user for the missing setup answer before escalating scope",
										reason:
											"Core setup data is still incomplete, so the safest next move is to collect it rather than inventing more canon.",
									},
								]
							: []),
						...(needsSocialGrounding
							? [
									{
										action:
											"Ask the user or table for the missing social response before locking in new character facts",
										reason:
											"A transcript-free social turn is more reliable when the NPC response is confirmed instead of inferred.",
									},
								]
							: []),
						...(!consistency.success
							? [
									{
										action:
											"Run continuity_audit before accepting the resolved state as stable",
										reason:
											"The post-turn consistency check reported drift or contradictions.",
										tool: "continuity_audit",
									},
								]
							: []),
					],
					riskFlags: [
						...(consistency.errorCount > 0
							? [
									{
										severity: "high" as const,
										flag: "CONSISTENCY_ERRORS",
										reason: `The post-turn continuity check reported ${String(consistency.errorCount)} error(s).`,
									},
								]
							: []),
						...(!actionResult.completeness.contextReady
							? [
									{
										severity: "medium" as const,
										flag: "COLD_CONTEXT",
										reason:
											"The action resolved before the broader context bundle was fully ready.",
									},
								]
							: []),
						...(actionResult.confidence.narration === "low" ||
						actionResult.confidence.discoveries === "low"
							? [
									{
										severity: "medium" as const,
										flag: "LOW_CONFIDENCE_INFERENCE",
										reason:
											"Some narration or discovery outputs are low confidence and should be narrated conservatively.",
									},
								]
							: []),
						...(needsSocialGrounding
							? [
									{
										severity: "medium" as const,
										flag: "MISSING_SOCIAL_GROUNDING",
										reason:
											"The scene turn resolved a social exchange without a grounding transcript.",
									},
								]
							: []),
						...(playerKnowledgeLeakDetected
							? [
									{
										severity: "high" as const,
										flag: "PLAYER_KNOWLEDGE_LEAK",
										reason:
											"The generated GM packet appears to expose hidden knowledge in table-facing language.",
									},
								]
							: []),
						...(actionResult.mechanics.required &&
						!actionResult.mechanics.resolved
							? [
									{
										severity: "medium" as const,
										flag: "MECHANICS_UNRESOLVED",
										reason:
											actionResult.mechanics.unsupportedReason ??
											"The ruleset adapter did not fully resolve the mechanics layer.",
									},
								]
							: []),
					],
					writePlan: {
						status: commitApplied
							? ("already_applied" as const)
							: ("recommended_only" as const),
						shouldWrite: commitApplied,
						summary:
							commitApplied && commitRecommended
								? "The scene turn advanced local canon, refreshed the current campaign state, and passed the verification gate."
								: commitApplied
									? "The scene turn advanced local canon, but follow-up review is still recommended before treating every consequence as fully settled."
									: "The scene turn was evaluated without committing canon because the verification gate or setup/social grounding requirements still require review.",
						targets: writeTargets,
					},
					provenance: [
						{
							source: "user-provided" as const,
							detail: `Player action input: ${action}`,
							confidence: "high" as const,
						},
						...(transcript
							? [
									{
										source: "user-provided" as const,
										detail:
											"A transcript was supplied to ground discovery synchronization.",
										confidence: "high" as const,
									},
								]
							: []),
						...actionResult.canonicalEventIds.map((eventId) => ({
							source: "canonical" as const,
							detail: `Canonical event persisted: ${eventId}`,
							confidence: "high" as const,
							citation: actionResult.historyPath,
						})),
						...discoveries
							.filter(
								(discovery) =>
									discovery.discoveryMode !== "explicitly_named" ||
									discovery.confidence !== "high",
							)
							.slice(0, 4)
							.map((discovery) => ({
								source: "inferred" as const,
								detail: `${discovery.displayName} was carried forward with ${discovery.confidence} confidence.`,
								confidence: discovery.confidence,
								citation: actionResult.statePath,
							})),
					],
				};
				const shouldSurfaceAsError =
					!output.success && !blockedCommit && !actionResult.requiresSetup;
				return makeToolResult(output, shouldSurfaceAsError);
			} catch (error) {
				return makeToolResult(
					{
						success: false,
						message:
							error instanceof Error
								? `Failed to resolve scene turn: ${error.message}`
								: "Failed to resolve scene turn.",
						gmPacket: emptyGmPacket,
						requiresSetup: false,
						setupStatus: "error",
						setupQuestionKey: null,
						setupQuestion: null,
						setupWarnings: [],
						pendingAction: null,
						actionResult: {
							locationAfter: "",
						},
						consistency: {
							success: false,
							errorCount: 1,
						},
						groundingStatus: "underspecified",
						factsFound: [],
						constraints: [
							"Do not narrate a lasting outcome when scene resolution fails before canon is updated.",
						],
						unknowns: [
							"The scene turn failed before a grounded resolution packet could be finalized.",
						],
						confidence: {
							overall: "low",
							grounding: "underspecified",
						},
						mustAskUser: true,
						inferencePolicy: "must_ask",
						commitRecommended: false,
						recommendedFollowUpTools: ["context_query", "continuity_audit"],
						recommendedReadTargets: [],
						verificationChecks: [
							{
								name: "continuity_contradiction_check",
								status: "failed",
								reason:
									"The scene turn failed before verification could complete successfully.",
							},
							{
								name: "player_knowledge_leak_check",
								status: "warning",
								reason:
									"Player-knowledge safety could not be verified because the scene turn failed early.",
							},
							{
								name: "unsupported_inference_promotion_check",
								status: "warning",
								reason:
									"Inference promotion could not be verified because the scene turn failed early.",
							},
							{
								name: "write_plan_sanity_check",
								status: "failed",
								reason:
									"No stable write plan is available when the scene turn fails.",
							},
							{
								name: "setup_completeness_check",
								status: "warning",
								reason:
									"Setup completeness could not be fully verified after the scene turn failure.",
							},
						],
						recommendedNextSteps: [
							{
								action: "Inspect the failure before continuing play",
								reason:
									"A failed scene turn should be repaired before the agent narrates the next canon-bearing step.",
							},
						],
						riskFlags: [
							{
								severity: "high",
								flag: "SCENE_TURN_FAILED",
								reason:
									error instanceof Error
										? error.message
										: "Scene turn resolution failed.",
							},
						],
						writePlan: {
							status: "none",
							shouldWrite: false,
							summary: "No write should proceed because the scene turn failed.",
							targets: [],
						},
						provenance: [
							{
								source: "user-provided",
								detail: `Player action input: ${action}`,
								confidence: "high",
							},
						],
					},
					true,
				);
			}
		},
	);
}
