import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { appendCanonicalEvent } from "../../domain/events/store";
import { renderMarkdown } from "../../domain/markdown/markdown";
import { regenerateCurrentStateProjection } from "../../domain/projections/current-state";
import type { AuthContext } from "../../types/contracts";
import { registerWorldStateReportTools } from "./world-state-reports";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type ReportHandler = (args: {
	sinceSequence?: number;
	playerView?: boolean;
}) => ToolResult<{
	success: boolean;
	reportType: string;
	filePath: string;
	rootPath: string;
	rawMarkdown: string;
}>;

type ReportToolName =
	| "world_state_overview"
	| "continuity_audit"
	| "timeline_diff"
	| "faction_pressure_report"
	| "npc_state_delta"
	| "player_knowledge_view"
	| "canon_vs_inference_report";

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureHandlers(args: {
	auth: AuthContext;
}): Record<ReportToolName, ReportHandler> {
	const handlers = {} as Record<ReportToolName, ReportHandler>;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: ReportHandler,
		): void => {
			handlers[name as ReportToolName] = callback;
		},
	} as unknown as McpServer;

	registerWorldStateReportTools(server, args.auth);
	return handlers;
}

describe("world-state report tools", () => {
	test("registers and reads the generated markdown report workflows", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-report-tools-"));
		const bardoRoot = path.join(root, "bardo");
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-report-tool-1",
				type: "player_action_resolved",
				atISO: "2026-02-23T03:00:00.000Z",
				source: "player_action",
				data: {
					action: "I ask who profited from the barge disappearing",
					worldTimeAfterISO: "2026-02-23T03:00:00.000Z",
					locationAfter: "river-market",
					createdLocationIds: ["river-market"],
					createdNpcIds: ["dock-clerk"],
				},
			},
		});
		await regenerateCurrentStateProjection({ bardoRoot });
		const handlers = captureHandlers({ auth: createAuth(root) });

		expect(Object.keys(handlers).sort()).toEqual([
			"canon_vs_inference_report",
			"continuity_audit",
			"faction_pressure_report",
			"npc_state_delta",
			"player_knowledge_view",
			"timeline_diff",
			"world_state_overview",
		]);

		const worldState = await handlers.world_state_overview({});
		expect(worldState.isError).toBe(false);
		expect(worldState.structuredContent.reportType).toBe(
			"world_state_overview",
		);
		expect(worldState.structuredContent.rawMarkdown).toContain("## Canon");
		expect(worldState.structuredContent.rawMarkdown).toContain("river-market");

		const continuity = await handlers.continuity_audit({});
		expect(continuity.isError).toBe(false);
		expect(continuity.structuredContent.reportType).toBe("continuity_audit");
		expect(continuity.structuredContent.rawMarkdown).toContain(
			"Consistency check",
		);

		const playerKnowledge = await handlers.player_knowledge_view({
			playerView: true,
		});
		expect(playerKnowledge.isError).toBe(false);
		expect(playerKnowledge.structuredContent.reportType).toBe(
			"player_knowledge_view",
		);
		expect(playerKnowledge.structuredContent.rawMarkdown).toContain(
			"Player-safe",
		);

		const timelineDiff = await handlers.timeline_diff({ sinceSequence: 1 });
		expect(timelineDiff.isError).toBe(false);
		expect(timelineDiff.structuredContent.reportType).toBe("timeline_diff");
		expect(timelineDiff.structuredContent.rawMarkdown).toContain(
			"Since sequence 1",
		);

		const npcDelta = await handlers.npc_state_delta({});
		expect(npcDelta.isError).toBe(false);
		expect(npcDelta.structuredContent.rawMarkdown).toContain("dock-clerk");

		const fileRaw = await readFile(
			worldState.structuredContent.filePath,
			"utf8",
		);
		expect(fileRaw).toBe(worldState.structuredContent.rawMarkdown);

		await rm(root, { recursive: true, force: true });
	});

	test("derives report state from canonical events when projection is missing", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-report-derived-state-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-report-canonical-1",
				type: "player_action_resolved",
				atISO: "2026-02-23T03:10:00.000Z",
				source: "player_action",
				data: {
					action: "I arrive in river-market",
					worldTimeAfterISO: "2026-02-23T03:10:00.000Z",
					locationAfter: "river-market",
					createdLocationIds: ["river-market"],
					createdNpcIds: [],
				},
			},
		});
		await Bun.write(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{
					title: "Campaign State",
					description: "Stale legacy state",
				},
				JSON.stringify(
					{
						currentLocation: "stale-village",
						worldTimeISO: "2026-02-23T00:00:00.000Z",
						counters: { unknownNpc: 0, unknownLocation: 0 },
						locations: {
							"stale-village": {
								name: "Stale Village",
								visits: 1,
								npcIds: [],
								tags: [],
								exits: [],
								activeClues: [],
								occupantIds: [],
							},
						},
						npcs: {},
						threads: {},
						factions: {},
						clocks: {},
						scene: {
							summary: "",
							activeSituation: "",
							exits: [],
							sensoryCues: [],
							unresolvedQuestions: [],
						},
						party: {
							currentLocation: "stale-village",
							statusSummary: "",
							knownResources: [],
							activeConditions: [],
						},
						mechanicsContext: {
							ruleset: "d20_v1",
							difficultyHint: null,
							combatActive: false,
							initiativeOrder: [],
							advantageHints: [],
						},
						lastAction: "legacy-only",
					},
					null,
					2,
				),
			),
		);

		const handlers = captureHandlers({ auth: createAuth(root) });
		const worldState = await handlers.world_state_overview({});

		expect(worldState.isError).toBe(false);
		expect(worldState.structuredContent.rawMarkdown).toContain("river-market");
		expect(worldState.structuredContent.rawMarkdown).not.toContain(
			"stale-village",
		);

		await rm(root, { recursive: true, force: true });
	});
});
