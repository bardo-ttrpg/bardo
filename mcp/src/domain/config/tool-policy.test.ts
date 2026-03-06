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
	test("uses standard profile by default outside production", () => {
		const config = resolveToolPolicyConfig({});
		expect(hasTool(config, "player_action")).toBe(true);
		expect(hasTool(config, "scene_turn")).toBe(true);
		expect(hasTool(config, "apply_domain_transition")).toBe(true);
		expect(hasTool(config, "migrate_legacy_state")).toBe(true);
		expect(hasTool(config, "eval_run_golden_scenarios")).toBe(true);
		expect(hasTool(config, "eval_run_long_campaign_stability")).toBe(true);
		expect(hasTool(config, "sessions_list")).toBe(true);
		expect(hasTool(config, "state_set")).toBe(false);
		expect(hasTool(config, "markdown_upsert")).toBe(false);
	});

	test("defaults to gameplay profile in production", () => {
		const config = resolveToolPolicyConfig({
			NODE_ENV: "production",
		});
		const resolved = resolveEffectiveToolPolicy(config, {
			providerId: null,
			modelId: null,
		});
		expect(resolved.profile).toBe("gameplay");
		expect(resolved.allowedTools.has("scene_turn")).toBe(true);
		expect(resolved.allowedTools.has("player_action")).toBe(true);
		expect(resolved.allowedTools.has("append_event")).toBe(false);
		expect(resolved.allowedTools.has("migrate_legacy_state")).toBe(false);
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

	test("standard profile excludes legacy canonical mutation tools", () => {
		const config = resolveToolPolicyConfig({
			BARDO_TOOLS_PROFILE: "standard",
		});
		const resolved = resolveEffectiveToolPolicy(config, {
			providerId: null,
			modelId: null,
		});
		expect(resolved.allowedTools.has("state_set")).toBe(false);
		expect(resolved.allowedTools.has("markdown_upsert")).toBe(false);
		expect(resolved.allowedTools.has("player_action")).toBe(true);
	});

	test("gameplay profile excludes admin and migration mutation tools", () => {
		const config = resolveToolPolicyConfig({
			BARDO_TOOLS_PROFILE: "gameplay",
		});
		const resolved = resolveEffectiveToolPolicy(config, {
			providerId: null,
			modelId: null,
		});
		expect(resolved.allowedTools.has("player_action")).toBe(true);
		expect(resolved.allowedTools.has("world_sync")).toBe(true);
		expect(resolved.allowedTools.has("simulation_tick")).toBe(true);
		expect(resolved.allowedTools.has("append_event")).toBe(false);
		expect(resolved.allowedTools.has("apply_domain_transition")).toBe(false);
		expect(resolved.allowedTools.has("migrate_legacy_state")).toBe(false);
		expect(resolved.allowedTools.has("entity_crud")).toBe(false);
	});

	test("rejects unknown tool names in allow list", () => {
		expect(() =>
			resolveToolPolicyConfig({
				BARDO_TOOLS_ALLOW: "nonexistent_tool",
			}),
		).toThrow("Unknown tool or group token");
	});
});
