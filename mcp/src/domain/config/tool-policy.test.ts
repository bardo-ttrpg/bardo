import { describe, expect, test } from "bun:test";
import {
	resolveEffectiveToolPolicy,
	resolveToolPolicyConfig,
	type ToolPolicyConfig,
} from "./tool-policy";

function hasTool(config: ToolPolicyConfig, tool: string): boolean {
	return resolveEffectiveToolPolicy(config, {
		providerId: null,
		modelId: null,
	}).allowedTools.has(tool);
}

describe("resolveToolPolicyConfig", () => {
	test("uses full profile by default", () => {
		const config = resolveToolPolicyConfig({});
		expect(hasTool(config, "player_action")).toBe(true);
		expect(hasTool(config, "sessions_list")).toBe(true);
	});

	test("supports minimal profile with allow overrides", () => {
		const config = resolveToolPolicyConfig({
			BARDO_TOOLS_PROFILE: "minimal",
			BARDO_TOOLS_ALLOW: "world_sync,group:sessions",
		});
		const resolved = resolveEffectiveToolPolicy(config, {
			providerId: null,
			modelId: null,
		});
		expect(resolved.allowedTools.has("world_sync")).toBe(true);
		expect(resolved.allowedTools.has("sessions_send")).toBe(true);
		expect(resolved.allowedTools.has("player_action")).toBe(false);
	});

	test("applies provider/model-specific overrides", () => {
		const config = resolveToolPolicyConfig({
			BARDO_TOOLS_PROFILE: "full",
			BARDO_TOOLS_BY_PROVIDER_JSON: JSON.stringify({
				openai: {
					profile: "minimal",
				},
				"openai/gpt-5": {
					allow: ["player_action"],
					deny: ["sessions_spawn"],
				},
			}),
		});

		const resolved = resolveEffectiveToolPolicy(config, {
			providerId: "openai",
			modelId: "gpt-5",
		});
		expect(resolved.allowedTools.has("player_action")).toBe(true);
		expect(resolved.allowedTools.has("sessions_spawn")).toBe(false);
		expect(resolved.allowedTools.has("event_crud")).toBe(false);
	});

	test("rejects unknown tool names in allow list", () => {
		expect(() =>
			resolveToolPolicyConfig({
				BARDO_TOOLS_ALLOW: "nonexistent_tool",
			}),
		).toThrow("Unknown tool or group token");
	});
});
