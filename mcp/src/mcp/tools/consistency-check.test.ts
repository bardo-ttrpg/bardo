import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { appendCanonicalEvent } from "../../domain/events/store";
import { parseMarkdown, renderMarkdown } from "../../domain/markdown/markdown";
import { regenerateCurrentStateProjection } from "../../domain/projections/current-state";
import type { AuthContext } from "../../types/contracts";
import { registerConsistencyCheckTool } from "./consistency-check";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type ConsistencyCheckHandler = (args: {
	includeWarnings?: boolean;
}) => ToolResult<{
	success: boolean;
	errorCount: number;
	warningCount: number;
	issues: Array<{ code: string }>;
}>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureHandler(args: { auth: AuthContext }): ConsistencyCheckHandler {
	let handler: ConsistencyCheckHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: ConsistencyCheckHandler,
		): void => {
			if (name === "consistency_check") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerConsistencyCheckTool(server, args.auth);
	if (!handler) {
		throw new Error("Failed to register consistency_check.");
	}
	return handler;
}

describe("consistency_check tool", () => {
	test("warns when legacy state drifts from canonical event-derived state", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-consistency-drift-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-consistency-1",
				type: "player_action_resolved",
				atISO: "2026-02-23T00:10:00.000Z",
				source: "player_action",
				data: {
					action: "I travel to river-market",
					worldTimeAfterISO: "2026-02-23T00:10:00.000Z",
					locationAfter: "river-market",
					createdLocationIds: ["river-market"],
				},
			},
		});
		await regenerateCurrentStateProjection({ bardoRoot });
		await Bun.write(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{
					title: "Campaign State",
					description: "Legacy state snapshot",
				},
				JSON.stringify(
					{
						currentLocation: "legacy-village",
						worldTimeISO: "2026-02-23T00:00:00.000Z",
						counters: { unknownNpc: 0, unknownLocation: 0 },
						locations: {
							"legacy-village": {
								name: "Legacy Village",
								visits: 1,
								npcIds: [],
							},
						},
						lastAction: "legacy_write",
					},
					null,
					2,
				),
			),
		);
		const handler = captureHandler({ auth: createAuth(root) });

		const result = await handler({ includeWarnings: true });
		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(
			result.structuredContent.issues.some(
				(issue) => issue.code === "LEGACY_STATE_EVENT_DRIFT",
			),
		).toBe(true);

		await rm(root, { recursive: true, force: true });
	});

	test("warns when projection drifts from canonical event-derived state", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-consistency-proj-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-consistency-2",
				type: "player_action_resolved",
				atISO: "2026-02-23T00:15:00.000Z",
				source: "player_action",
				data: {
					action: "I explore river-market",
					worldTimeAfterISO: "2026-02-23T00:15:00.000Z",
					locationAfter: "river-market",
					createdLocationIds: ["river-market"],
				},
			},
		});
		const projection = await regenerateCurrentStateProjection({ bardoRoot });
		const projectionRaw = await Bun.file(projection.projectionPath).text();
		const parsed = parseMarkdown(projectionRaw);
		const projectionState = JSON.parse(parsed.content) as {
			lastAction: string;
		};
		projectionState.lastAction = "tampered-projection";
		await writeFile(
			projection.projectionPath,
			renderMarkdown(
				parsed.frontmatter,
				JSON.stringify(projectionState, null, 2),
			),
			"utf8",
		);
		const handler = captureHandler({ auth: createAuth(root) });

		const result = await handler({ includeWarnings: true });
		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(
			result.structuredContent.issues.some(
				(issue) => issue.code === "PROJECTION_EVENT_DRIFT",
			),
		).toBe(true);

		await rm(root, { recursive: true, force: true });
	});

	test("fails in strict canonical mode when projection is missing and legacy fallback would be used", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-consistency-strict-legacy-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await Bun.write(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{
					title: "Campaign State",
					description: "Legacy state snapshot",
				},
				JSON.stringify(
					{
						currentLocation: "legacy-village",
						worldTimeISO: "2026-02-23T00:00:00.000Z",
						counters: { unknownNpc: 0, unknownLocation: 0 },
						locations: {
							"legacy-village": {
								name: "Legacy Village",
								visits: 1,
								npcIds: [],
							},
						},
						lastAction: "legacy_write",
					},
					null,
					2,
				),
			),
		);

		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "true";
		try {
			const handler = captureHandler({ auth: createAuth(root) });
			const result = await handler({ includeWarnings: true });
			expect(result.isError).toBe(true);
			expect(result.structuredContent.success).toBe(false);
		} finally {
			if (previousStrict === undefined) {
				delete Bun.env.BARDO_STRICT_CANONICAL_MODE;
			} else {
				Bun.env.BARDO_STRICT_CANONICAL_MODE = previousStrict;
			}
			await rm(root, { recursive: true, force: true });
		}
	});

	test("fails in strict canonical mode when projection metadata is stale", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-consistency-strict-stale-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-consistency-strict-stale-1",
				type: "player_action_resolved",
				atISO: "2026-02-23T00:10:00.000Z",
				source: "player_action",
				data: {
					action: "I explore river-market",
					worldTimeAfterISO: "2026-02-23T00:10:00.000Z",
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
					description: "Derived state",
					projection_schema: "v1",
					source_event_seq_min: "1",
					source_event_seq_max: "0",
					source_event_count: "1",
					generated_at_iso: "2026-02-23T00:00:00.000Z",
				},
				JSON.stringify(
					{
						currentLocation: "river-market",
						worldTimeISO: "2026-02-23T00:10:00.000Z",
						counters: { unknownNpc: 0, unknownLocation: 1 },
						locations: {
							"river-market": {
								name: "River Market",
								visits: 1,
								npcIds: [],
							},
						},
						lastAction: "I explore river-market",
					},
					null,
					2,
				),
			),
			"utf8",
		);

		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "true";
		try {
			const handler = captureHandler({ auth: createAuth(root) });
			const result = await handler({ includeWarnings: true });
			expect(result.isError).toBe(true);
			expect(result.structuredContent.success).toBe(false);
			expect(
				result.structuredContent.issues.some(
					(issue) => issue.code === "STRICT_CANONICAL_STALE_PROJECTION",
				),
			).toBe(true);
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
