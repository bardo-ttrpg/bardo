import { describe, expect, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	renderPrometheusMetrics,
	resetTelemetryForTests,
} from "../../telemetry";
import type { AuthContext } from "../../types/contracts";
import { registerEvalRunLongCampaignStabilityTool } from "./eval-run-long-campaign-stability";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type EvalRunLongCampaignStabilityHandler = (args: {
	turnCount?: number;
	retryInjection?: boolean;
}) => ToolResult<{
	success: boolean;
	turnCount: number;
	failedTurns: number;
	retryInjection: {
		enabled: boolean;
		injectedTurns: number;
	};
}>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureEvalHandler(args: {
	auth: AuthContext;
}): EvalRunLongCampaignStabilityHandler {
	let handler: EvalRunLongCampaignStabilityHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: EvalRunLongCampaignStabilityHandler,
		): void => {
			if (name === "eval_run_long_campaign_stability") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerEvalRunLongCampaignStabilityTool(server, args.auth);
	if (!handler) {
		throw new Error("Failed to register eval_run_long_campaign_stability.");
	}
	return handler;
}

describe("eval_run_long_campaign_stability tool", () => {
	test("runs long-run stability eval and returns summary", async () => {
		resetTelemetryForTests();
		const handler = captureEvalHandler({
			auth: createAuth("/tmp/bardo-long-run-tool"),
		});
		const result = await handler({
			turnCount: 25,
			retryInjection: true,
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.turnCount).toBe(25);
		expect(result.structuredContent.failedTurns).toBe(0);
		expect(result.structuredContent.retryInjection.enabled).toBe(true);
		expect(
			result.structuredContent.retryInjection.injectedTurns,
		).toBeGreaterThan(0);
		const metrics = renderPrometheusMetrics();
		expect(metrics).toContain("bardo_eval_long_run_runs_total");
		expect(metrics).toContain("bardo_eval_long_run_duration_ms_count");
		expect(metrics).toContain('outcome="success"');
		expect(metrics).toContain(
			'bardo_eval_long_run_replay_drift_total{dimension="none"} 1',
		);
	});
});
