import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { AuthContext } from "../../types/contracts";
import {
	GOLDEN_SCENARIO_IDS,
	type GoldenScenarioId,
	runGoldenScenarioSuite,
} from "../evals/golden-scenarios";
import {
	annotateWithMinPlan,
	hasRequiredPlan,
	makePlanDeniedToolResult,
} from "../tool-plan";
import { makeToolResult } from "../tool-result";

const goldenScenarioIdSchema = z.enum(GOLDEN_SCENARIO_IDS);

const evalRunGoldenScenariosInputSchema = z.object({
	scenarioIds: z
		.array(goldenScenarioIdSchema)
		.min(1)
		.max(GOLDEN_SCENARIO_IDS.length)
		.optional()
		.describe("Optional subset of golden scenario ids to run."),
});

const evalRunGoldenScenariosOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	total: z.number().int().nonnegative(),
	passed: z.number().int().nonnegative(),
	failed: z.number().int().nonnegative(),
	results: z.array(
		z.object({
			id: goldenScenarioIdSchema,
			success: z.boolean(),
			message: z.string(),
			details: z.record(z.string(), z.unknown()),
		}),
	),
});

export function registerEvalRunGoldenScenariosTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"eval_run_golden_scenarios",
		{
			title: "Run Golden Scenario Evals",
			description:
				"Run deterministic golden scenario evals in isolated temporary workspaces and return a pass/fail summary.",
			inputSchema: evalRunGoldenScenariosInputSchema,
			outputSchema: evalRunGoldenScenariosOutputSchema,
			annotations: annotateWithMinPlan("solo", {
				title: "Run Golden Scenario Evals",
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			}),
		},
		async ({ scenarioIds }) => {
			if (!hasRequiredPlan(auth.plan ?? null, "solo")) {
				return makePlanDeniedToolResult("solo");
			}
			const suite = await runGoldenScenarioSuite({
				scenarioIds: scenarioIds as GoldenScenarioId[] | undefined,
			});
			const success = suite.failed === 0;
			return makeToolResult(
				{
					success,
					message: success
						? `Golden scenarios passed (${String(suite.passed)}/${String(suite.total)}).`
						: `Golden scenarios failed (${String(suite.failed)} failed of ${String(suite.total)}).`,
					total: suite.total,
					passed: suite.passed,
					failed: suite.failed,
					results: suite.results,
				},
				!success,
			);
		},
	);
}
