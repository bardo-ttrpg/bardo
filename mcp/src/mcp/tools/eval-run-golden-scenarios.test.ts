import { describe, expect, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthContext } from "../../types/contracts";
import { registerEvalRunGoldenScenariosTool } from "./eval-run-golden-scenarios";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type EvalRunGoldenScenariosHandler = (args: {
	scenarioIds?: Array<
		| "combat_exchange"
		| "safety_boundary_block"
		| "idempotent_replay_integrity"
		| "legacy_state_migration"
	>;
}) => ToolResult<{
	success: boolean;
	total: number;
	passed: number;
	failed: number;
}>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureEvalHandler(args: {
	auth: AuthContext;
}): EvalRunGoldenScenariosHandler {
	let handler: EvalRunGoldenScenariosHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: EvalRunGoldenScenariosHandler,
		): void => {
			if (name === "eval_run_golden_scenarios") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerEvalRunGoldenScenariosTool(server, args.auth);
	if (!handler) {
		throw new Error("Failed to register eval_run_golden_scenarios.");
	}
	return handler;
}

describe("eval_run_golden_scenarios tool", () => {
	test("runs targeted scenarios and returns pass/fail summary", async () => {
		const handler = captureEvalHandler({
			auth: createAuth("/tmp/bardo-eval-tool"),
		});
		const result = await handler({
			scenarioIds: ["combat_exchange", "idempotent_replay_integrity"],
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.total).toBe(2);
		expect(result.structuredContent.failed).toBe(0);
		expect(result.structuredContent.passed).toBe(2);
	});
});
