import { describe, expect, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthContext } from "../../types/contracts";
import { registerValidateActionAgainstRulesetTool } from "./validate-action-against-ruleset";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type ValidateActionHandler = (args: {
	ruleset?: string;
	actionType: string;
	targetDifficulty?: number;
	modifier?: number;
	actorId?: string;
	declaredIntent?: string;
	advantage?: "none" | "advantage" | "disadvantage";
}) => ToolResult<{
	success: boolean;
	valid: boolean;
	ruleset: string;
	supportedActionTypes: string[];
	errors: string[];
	warnings: string[];
}>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureHandler(args: { auth: AuthContext }): ValidateActionHandler {
	let handler: ValidateActionHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: ValidateActionHandler,
		): void => {
			if (name === "validate_action_against_ruleset") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerValidateActionAgainstRulesetTool(server, args.auth);
	if (!handler) {
		throw new Error("Failed to register validate_action_against_ruleset.");
	}
	return handler;
}

describe("validate_action_against_ruleset tool", () => {
	test("returns invalid when targetDifficulty is missing", async () => {
		const handler = captureHandler({
			auth: createAuth("/tmp/bardo-validate-a"),
		});
		const result = await handler({
			actionType: "skill_check",
			declaredIntent: "I pick the lock",
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.valid).toBe(false);
		expect(result.structuredContent.errors.length).toBeGreaterThan(0);
	});

	test("returns valid for a bounded d20 check action", async () => {
		const handler = captureHandler({
			auth: createAuth("/tmp/bardo-validate-b"),
		});
		const result = await handler({
			actionType: "attack_roll",
			targetDifficulty: 15,
			modifier: 4,
			actorId: "pc_01",
			declaredIntent: "I strike with my sword",
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.valid).toBe(true);
		expect(result.structuredContent.errors).toEqual([]);
	});

	test("returns valid for narrative_v1 supported action type", async () => {
		const handler = captureHandler({
			auth: createAuth("/tmp/bardo-validate-c"),
		});
		const result = await handler({
			ruleset: "narrative_v1",
			actionType: "narrative_check",
			targetDifficulty: 12,
			modifier: 3,
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.valid).toBe(true);
		expect(result.structuredContent.ruleset).toBe("narrative_v1");
		expect(result.structuredContent.supportedActionTypes).toContain(
			"narrative_check",
		);
	});
});
