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
		plan: "solo",
	};
}

function captureEvalHandler(args: { auth: AuthContext }): {
	handler: EvalRunGoldenScenariosHandler;
	spec: Record<string, unknown>;
} {
	let handler: EvalRunGoldenScenariosHandler | null = null;
	let spec: Record<string, unknown> | null = null;
	const server = {
		registerTool: (
			name: string,
			nextSpec: unknown,
			callback: EvalRunGoldenScenariosHandler,
		): void => {
			if (name === "eval_run_golden_scenarios") {
				handler = callback;
				spec = nextSpec as Record<string, unknown>;
			}
		},
	} as unknown as McpServer;

	registerEvalRunGoldenScenariosTool(server, args.auth);
	if (!handler || !spec) {
		throw new Error("Failed to register eval_run_golden_scenarios.");
	}
	return { handler, spec };
}

describe("eval_run_golden_scenarios tool", () => {
	test("runs targeted scenarios and returns pass/fail summary", async () => {
		const { handler, spec } = captureEvalHandler({
			auth: createAuth("/tmp/bardo-eval-tool"),
		});
		const result = await handler({
			scenarioIds: ["combat_exchange", "idempotent_replay_integrity"],
		});

		expect(spec.annotations).toMatchObject({
			"x-bardo-min-plan": "solo",
		});
		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.total).toBe(2);
		expect(result.structuredContent.failed).toBe(0);
		expect(result.structuredContent.passed).toBe(2);
	});

	test("rejects free-plan auth contexts before running evals", async () => {
		const { handler } = captureEvalHandler({
			auth: {
				apiKey: null,
				campaignBasePath: "/tmp/bardo-eval-tool",
				plan: "free",
			},
		});

		const result = await handler({});

		expect(result.isError).toBe(true);
		expect(result.structuredContent).toMatchObject({
			success: false,
			message: expect.stringContaining("solo"),
		});
	});
});
