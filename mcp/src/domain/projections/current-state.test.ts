import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendCanonicalEvent } from "../events/store";
import { parseMarkdown } from "../markdown/markdown";
import { regenerateCurrentStateProjection } from "./current-state";

describe("regenerateCurrentStateProjection", () => {
	test("builds current-state projection from canonical player action events", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-projection-state-"),
		);
		const bardoRoot = path.join(root, "bardo");

		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-1",
				type: "player_action_resolved",
				atISO: "2026-02-23T00:10:00.000Z",
				source: "player_action",
				data: {
					action: "I travel to river-market",
					worldTimeAfterISO: "2026-02-23T00:10:00.000Z",
					locationAfter: "river-market",
					createdNpcIds: ["unknown_npc_01"],
					createdLocationIds: ["river-market"],
				},
			},
		});

		const projection = await regenerateCurrentStateProjection({ bardoRoot });

		expect(projection.eventCount).toBe(1);
		const raw = await readFile(projection.projectionPath, "utf8");
		const parsed = parseMarkdown(raw);
		expect(parsed.frontmatter.projection_schema).toBe("v1");
		expect(parsed.frontmatter.source_event_seq_min).toBe("1");
		expect(parsed.frontmatter.source_event_seq_max).toBe("1");
		expect(parsed.frontmatter.source_event_count).toBe("1");
		expect(parsed.frontmatter.generated_at_iso).toBeString();
		const state = JSON.parse(parsed.content) as {
			currentLocation: string;
			worldTimeISO: string;
			lastAction: string;
			counters: { unknownNpc: number; unknownLocation: number };
			locations: Record<string, { visits: number; npcIds: string[] }>;
		};

		expect(state.currentLocation).toBe("river-market");
		expect(state.worldTimeISO).toBe("2026-02-23T00:10:00.000Z");
		expect(state.lastAction).toBe("I travel to river-market");
		expect(state.counters.unknownNpc).toBe(1);
		expect(state.counters.unknownLocation).toBe(1);
		expect(state.locations["river-market"]?.visits).toBe(1);
		expect(state.locations["river-market"]?.npcIds).toContain("unknown_npc_01");

		await rm(root, { recursive: true, force: true });
	});

	test("applies state snapshots from world_sync and simulation_tick events", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-projection-snapshot-"),
		);
		const bardoRoot = path.join(root, "bardo");

		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-snapshot-1",
				type: "world_sync_applied",
				atISO: "2026-02-23T01:00:00.000Z",
				source: "world_sync",
				data: {
					stateAfter: {
						worldTimeISO: "2026-02-23T01:00:00.000Z",
						currentLocation: "river-market",
						counters: { unknownNpc: 1, unknownLocation: 1 },
						locations: {
							"river-market": {
								name: "River Market",
								visits: 1,
								npcIds: ["river-keeper"],
							},
						},
						lastAction: "world_sync",
					},
				},
			},
		});
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-snapshot-2",
				type: "simulation_tick_applied",
				atISO: "2026-02-23T02:00:00.000Z",
				source: "simulation_tick",
				data: {
					stateAfter: {
						worldTimeISO: "2026-02-23T02:00:00.000Z",
						currentLocation: "river-market",
						counters: { unknownNpc: 1, unknownLocation: 1 },
						locations: {
							"river-market": {
								name: "River Market",
								visits: 1,
								npcIds: ["river-keeper"],
							},
						},
						lastAction: "simulation_tick:turn",
					},
				},
			},
		});

		const projection = await regenerateCurrentStateProjection({ bardoRoot });
		const raw = await readFile(projection.projectionPath, "utf8");
		const state = JSON.parse(parseMarkdown(raw).content) as {
			worldTimeISO: string;
			lastAction: string;
		};
		expect(state.worldTimeISO).toBe("2026-02-23T02:00:00.000Z");
		expect(state.lastAction).toBe("simulation_tick:turn");

		await rm(root, { recursive: true, force: true });
	});
});
