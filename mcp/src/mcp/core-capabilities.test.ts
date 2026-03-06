import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { appendCanonicalEvent } from "../domain/events/store";
import { renderMarkdown } from "../domain/markdown/markdown";
import { regenerateCurrentStateProjection } from "../domain/projections/current-state";
import type { AuthContext } from "../types/contracts";
import { registerCoreResourcesAndPrompts } from "./core-capabilities";

type ResourceRegistration = {
	name: string;
	uri: string;
	handler: () => Promise<{ contents: Array<{ uri: string; text?: string }> }>;
};

type PromptRegistration = {
	name: string;
	handler: (args: Record<string, unknown>) => Promise<{
		messages: Array<{ role: string; content: { type: string; text: string } }>;
	}>;
};

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

describe("registerCoreResourcesAndPrompts", () => {
	test("registers resources and prompts with usable callbacks", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-core-capabilities-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-core-capabilities-1",
				type: "player_action_resolved",
				atISO: "2026-02-23T00:10:00.000Z",
				source: "player_action",
				data: {
					action: "I explore the market",
					worldTimeAfterISO: "2026-02-23T00:10:00.000Z",
					locationAfter: "river-market",
					createdLocationIds: ["river-market"],
				},
			},
		});
		await regenerateCurrentStateProjection({ bardoRoot });

		const registeredResources: ResourceRegistration[] = [];
		const registeredPrompts: PromptRegistration[] = [];
		const server = {
			registerResource: (
				name: string,
				uri: string,
				_config: unknown,
				handler: ResourceRegistration["handler"],
			): void => {
				registeredResources.push({ name, uri, handler });
			},
			registerPrompt: (
				name: string,
				_config: unknown,
				handler: PromptRegistration["handler"],
			): void => {
				registeredPrompts.push({ name, handler });
			},
		} as unknown as McpServer;

		registerCoreResourcesAndPrompts(server, createAuth(root));

		expect(registeredResources.map((entry) => entry.name)).toEqual([
			"campaign_current_summary",
			"scene_current",
			"party_status",
			"npc_active_roster",
			"npcs_roster",
			"threads_open",
			"combat_current",
			"rules_current_ruleset_summary",
			"table_contract",
			"authority_policy",
			"events_recent_digest",
		]);
		expect(registeredPrompts.map((entry) => entry.name)).toEqual([
			"resolve_player_action",
			"resolve_player_action_v1",
			"run_scene_turn",
			"run_scene_turn_v1",
			"generate_session_recap",
			"generate_session_recap_v1",
			"adjudicate_ambiguous_rule",
			"adjudicate_ambiguous_rule_v1",
			"safety_pause_and_reframe",
			"safety_pause_and_reframe_v1",
			"advance_world_between_sessions",
			"advance_world_between_sessions_v1",
		]);

		for (const resource of registeredResources) {
			const response = await resource.handler();
			const payload = JSON.parse(response.contents[0]?.text ?? "{}") as {
				contractVersion?: string;
			};
			expect(payload.contractVersion).toBe("v1");
		}

		const campaignResource = await registeredResources[0]?.handler();
		const campaignPayload = JSON.parse(
			campaignResource?.contents[0]?.text ?? "{}",
		) as {
			currentLocation: string;
			totalCanonicalEvents: number;
			provenance: {
				projection: {
					sourceEventSequenceMax: number | null;
				};
			};
		};
		expect(campaignPayload.currentLocation).toBe("river-market");
		expect(campaignPayload.totalCanonicalEvents).toBe(1);
		expect(campaignPayload.provenance.projection.sourceEventSequenceMax).toBe(
			1,
		);
		const partyResource = await registeredResources[2]?.handler();
		const partyPayload = JSON.parse(
			partyResource?.contents[0]?.text ?? "{}",
		) as {
			stateSource: string;
			party: {
				currentLocation: string;
			};
		};
		expect(partyPayload.party.currentLocation).toBe("river-market");
		expect(partyPayload.stateSource).toBe("projection");
		const combatResource = await registeredResources[6]?.handler();
		const combatPayload = JSON.parse(
			combatResource?.contents[0]?.text ?? "{}",
		) as {
			combat?: {
				active?: boolean;
			};
		};
		expect(combatPayload.combat?.active).toBe(false);
		const npcRosterResource = await registeredResources[4]?.handler();
		const npcRosterPayload = JSON.parse(
			npcRosterResource?.contents[0]?.text ?? "{}",
		) as {
			npcs?: unknown[];
		};
		expect(Array.isArray(npcRosterPayload.npcs)).toBe(true);

		const resolveActionPrompt = await registeredPrompts
			.find((entry) => entry.name === "resolve_player_action")
			?.handler({
				action: "I inspect the stall",
			});
		expect(resolveActionPrompt?.messages[0]?.content.text).toContain(
			"validate_action_against_ruleset",
		);
		const runSceneTurnPrompt = await registeredPrompts
			.find((entry) => entry.name === "run_scene_turn")
			?.handler({
				action: "I question the barkeep.",
			});
		expect(runSceneTurnPrompt?.messages[0]?.content.text).toContain(
			"resource://npcs/roster",
		);
		const safetyPrompt = await registeredPrompts
			.find((entry) => entry.name === "safety_pause_and_reframe")
			?.handler({
				boundary: "graphic violence",
			});
		expect(safetyPrompt?.messages[0]?.content.text).toContain("safety pause");

		await rm(root, { recursive: true, force: true });
	});

	test("auto-refreshes stale projection for resources in non-strict mode", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-core-capabilities-stale-refresh-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-core-stale-1",
				type: "player_action_resolved",
				atISO: "2026-02-23T00:20:00.000Z",
				source: "player_action",
				data: {
					action: "I travel to river-market",
					worldTimeAfterISO: "2026-02-23T00:20:00.000Z",
					locationAfter: "river-market",
					createdLocationIds: ["river-market"],
				},
			},
		});
		const projectionPath = path.join(bardoRoot, "projections/current-state.md");
		await mkdir(path.dirname(projectionPath), { recursive: true });
		await writeFile(
			projectionPath,
			renderMarkdown(
				{
					title: "Current State Projection",
					description: "Derived campaign state projection",
					projection_schema: "v1",
					generated_at_iso: "2026-02-23T00:00:00.000Z",
					source_event_seq_min: "1",
					source_event_seq_max: "0",
					source_event_count: "1",
				},
				JSON.stringify(
					{
						currentLocation: "stale-location",
					},
					null,
					2,
				),
			),
			"utf8",
		);

		const resources: ResourceRegistration[] = [];
		const prompts: PromptRegistration[] = [];
		const server = {
			registerResource: (
				name: string,
				uri: string,
				_config: unknown,
				handler: ResourceRegistration["handler"],
			): void => {
				resources.push({ name, uri, handler });
			},
			registerPrompt: (
				name: string,
				_config: unknown,
				handler: PromptRegistration["handler"],
			): void => {
				prompts.push({ name, handler });
			},
		} as unknown as McpServer;

		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "false";
		try {
			registerCoreResourcesAndPrompts(server, createAuth(root));
			expect(prompts.length).toBeGreaterThan(0);
			const campaignSummary = await resources[0]?.handler();
			const payload = JSON.parse(
				campaignSummary?.contents[0]?.text ?? "{}",
			) as {
				currentLocation: string;
				provenance: {
					projection: {
						sourceEventSequenceMax: number | null;
					};
				};
			};
			expect(payload.currentLocation).toBe("river-market");
			expect(payload.provenance.projection.sourceEventSequenceMax).toBe(1);
		} finally {
			if (previousStrict === undefined) {
				delete Bun.env.BARDO_STRICT_CANONICAL_MODE;
			} else {
				Bun.env.BARDO_STRICT_CANONICAL_MODE = previousStrict;
			}
			await rm(root, { recursive: true, force: true });
		}
	});

	test("auto-recovers stale projection when strict mode reads a resource", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-core-capabilities-stale-strict-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-core-stale-strict-1",
				type: "player_action_resolved",
				atISO: "2026-02-23T00:30:00.000Z",
				source: "player_action",
				data: {
					action: "I travel to river-market",
					worldTimeAfterISO: "2026-02-23T00:30:00.000Z",
					locationAfter: "river-market",
					createdLocationIds: ["river-market"],
				},
			},
		});
		const projectionPath = path.join(bardoRoot, "projections/current-state.md");
		await mkdir(path.dirname(projectionPath), { recursive: true });
		await writeFile(
			projectionPath,
			renderMarkdown(
				{
					title: "Current State Projection",
					description: "Derived campaign state projection",
					projection_schema: "v1",
					generated_at_iso: "2026-02-23T00:00:00.000Z",
					source_event_seq_min: "1",
					source_event_seq_max: "0",
					source_event_count: "1",
				},
				JSON.stringify(
					{
						currentLocation: "stale-location",
					},
					null,
					2,
				),
			),
			"utf8",
		);

		const resources: ResourceRegistration[] = [];
		const server = {
			registerResource: (
				name: string,
				uri: string,
				_config: unknown,
				handler: ResourceRegistration["handler"],
			): void => {
				resources.push({ name, uri, handler });
			},
			registerPrompt: (): void => {},
		} as unknown as McpServer;

		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "true";
		try {
			registerCoreResourcesAndPrompts(server, createAuth(root));
			const result = await resources[0]?.handler();
			const content = result?.contents?.[0];
			expect(typeof content?.text).toBe("string");
			const payload = JSON.parse(content?.text ?? "{}") as {
				currentLocation?: string;
				stateSource?: string;
			};
			expect(payload.currentLocation).toBe("river-market");
			expect(payload.stateSource).toBe("projection");
		} finally {
			if (previousStrict === undefined) {
				delete Bun.env.BARDO_STRICT_CANONICAL_MODE;
			} else {
				Bun.env.BARDO_STRICT_CANONICAL_MODE = previousStrict;
			}
			await rm(root, { recursive: true, force: true });
		}
	});
});
