import { describe, expect, test } from "bun:test";
import { createMcpServer } from "./create-mcp-server";

describe("createMcpServer", () => {
	test("registers only the V1 remote Bardo tool surface", () => {
		const server = createMcpServer({
			apiKey: "test-access-token",
			campaignBasePath: "/tmp/bardo-workspace",
			plan: "solo",
		});

		const registeredToolNames = Object.keys(
			(
				server as unknown as {
					_registeredTools?: Record<string, unknown>;
				}
			)._registeredTools ?? {},
		).sort();

		expect(registeredToolNames).toEqual(
			[
				"context_query",
				"continuity_audit",
				"player_knowledge_view",
				"scene_turn",
				"timeline_diff",
				"world_state_overview",
			].sort(),
		);
		expect(registeredToolNames).not.toContain("state_set");
		expect(registeredToolNames).not.toContain("world_sync");
		expect(registeredToolNames).not.toContain("eval_run_golden_scenarios");
		expect(registeredToolNames).not.toContain("sessions_spawn");

		const registeredResources = Object.keys(
			(
				server as unknown as {
					_registeredResources?: Record<string, unknown>;
				}
			)._registeredResources ?? {},
		);
		const registeredPrompts = Object.keys(
			(
				server as unknown as {
					_registeredPrompts?: Record<string, unknown>;
				}
			)._registeredPrompts ?? {},
		);

		expect(registeredResources).toEqual([]);
		expect(registeredPrompts).toEqual([]);

		const registeredTools =
			(
				server as unknown as {
					_registeredTools?: Record<string, { description?: string }>;
				}
			)._registeredTools ?? {};

		expect(registeredTools.scene_turn?.description).toContain("When to use");
		expect(registeredTools.scene_turn?.description).toContain(
			"When not to use",
		);
		expect(registeredTools.scene_turn?.description).toContain("Example:");
		expect(registeredTools.context_query?.description).toContain(
			"When not to use",
		);
	});
});
