import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { recordLongRunCampaignEvalMetric } from "../../telemetry";
import type { AuthContext } from "../../types/contracts";
import { runLongRunCampaignStabilityEval } from "../evals/long-run-campaign-stability";
import {
	annotateWithMinPlan,
	hasRequiredPlan,
	makePlanDeniedToolResult,
} from "../tool-plan";
import { makeToolResult } from "../tool-result";

const evalRunLongCampaignStabilityInputSchema = z.object({
	turnCount: z
		.number()
		.int()
		.min(25)
		.max(40)
		.default(30)
		.describe(
			"Number of turns to execute in the long-run campaign stability eval (strict soak mode).",
		),
	retryInjection: z
		.boolean()
		.default(true)
		.describe("Inject bounded retry failure attempts during the soak run."),
});

const evalRunLongCampaignStabilityOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	turnCount: z.number().int().min(25).max(40),
	failedTurns: z.number().int().nonnegative(),
	invariantFailures: z.object({
		actionFailed: z.number().int().nonnegative(),
		eventGrowthViolation: z.number().int().nonnegative(),
		projectionDrift: z.number().int().nonnegative(),
		replayEventDrift: z.number().int().nonnegative(),
		replayProjectionDrift: z.number().int().nonnegative(),
		eventOrderingDrift: z.number().int().nonnegative(),
		partialCanonicalStateAfterRetryFailure: z.number().int().nonnegative(),
	}),
	replayConsistency: z.object({
		stable: z.boolean(),
		eventCountBeforeReplay: z.number().int().nonnegative(),
		eventCountAfterReplay: z.number().int().nonnegative(),
		projectionStable: z.boolean(),
	}),
	turnResults: z.array(
		z.object({
			turn: z.number().int().positive(),
			action: z.string(),
			success: z.boolean(),
			canonicalEvents: z.number().int().nonnegative(),
			projectionConsistent: z.boolean(),
			worldTimeISO: z.string(),
			message: z.string(),
			retryInjected: z.boolean(),
			retryFailedAttempt: z.boolean(),
			retryFailedAttemptEventDelta: z.number().int(),
			eventTypes: z.array(z.string()),
			expectedEventTypes: z.array(z.string()),
			eventOrderingOk: z.boolean(),
		}),
	),
	fallbackCounters: z.object({
		used: z.number().nonnegative(),
		blocked: z.number().nonnegative(),
	}),
	policyViolationCounters: z.object({
		runtimePolicyBlockedEvents: z.number().int().nonnegative(),
	}),
	retryInjection: z.object({
		enabled: z.boolean(),
		injectedTurns: z.number().int().nonnegative(),
		failedAttempts: z.number().int().nonnegative(),
		partialStateViolations: z.number().int().nonnegative(),
	}),
	eventOrderingLogs: z.array(
		z.object({
			turn: z.number().int().positive(),
			expectedEventTypes: z.array(z.string()),
			actualEventTypes: z.array(z.string()),
			match: z.boolean(),
		}),
	),
});

export function registerEvalRunLongCampaignStabilityTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"eval_run_long_campaign_stability",
		{
			title: "Run Long Campaign Stability Eval",
			description:
				"Runs a strict 25-40 turn stability simulation with retry injection and validates replay consistency + projection integrity.",
			inputSchema: evalRunLongCampaignStabilityInputSchema,
			outputSchema: evalRunLongCampaignStabilityOutputSchema,
			annotations: annotateWithMinPlan("solo_plus", {
				title: "Run Long Campaign Stability Eval",
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			}),
		},
		async ({ turnCount, retryInjection }) => {
			if (!hasRequiredPlan(auth.plan ?? null, "solo_plus")) {
				return makePlanDeniedToolResult("solo_plus");
			}
			const startedAt = performance.now();
			const result = await runLongRunCampaignStabilityEval({
				turnCount,
				retryInjection,
			});
			const durationMs = performance.now() - startedAt;
			recordLongRunCampaignEvalMetric({
				outcome: result.success ? "success" : "error",
				durationMs,
				turnCount: result.turnCount,
				failedTurns: result.failedTurns,
				invariantFailures: result.invariantFailures,
				replayConsistency: result.replayConsistency,
			});
			return makeToolResult(
				{
					success: result.success,
					message: result.success
						? `Long-run stability eval passed (${String(result.turnCount)} turns).`
						: `Long-run stability eval failed with ${String(result.failedTurns)} failed turns.`,
					turnCount: result.turnCount,
					failedTurns: result.failedTurns,
					invariantFailures: result.invariantFailures,
					replayConsistency: result.replayConsistency,
					turnResults: result.turnResults,
					fallbackCounters: result.fallbackCounters,
					policyViolationCounters: result.policyViolationCounters,
					retryInjection: result.retryInjection,
					eventOrderingLogs: result.eventOrderingLogs,
				},
				!result.success,
			);
		},
	);
}
