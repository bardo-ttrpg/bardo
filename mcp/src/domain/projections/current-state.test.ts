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
		expect(parsed.frontmatter.projection_schema).toBe("v2");
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

	test("synchronizes legacy state/current.md to the regenerated projection state", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-projection-legacy-sync-"),
		);
		const bardoRoot = path.join(root, "bardo");

		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-legacy-sync-1",
				type: "player_action_resolved",
				atISO: "2026-02-23T02:10:00.000Z",
				source: "player_action",
				data: {
					action: "I arrive in thornwick",
					worldTimeAfterISO: "2026-02-23T02:10:00.000Z",
					locationAfter: "thornwick",
					createdLocationIds: ["thornwick"],
				},
			},
		});

		const projection = await regenerateCurrentStateProjection({ bardoRoot });
		const projectionState = JSON.parse(
			parseMarkdown(await readFile(projection.projectionPath, "utf8")).content,
		);
		const legacyStatePath = path.join(bardoRoot, "state/current.md");
		const legacyState = JSON.parse(
			parseMarkdown(await readFile(legacyStatePath, "utf8")).content,
		);

		expect(legacyState).toEqual(projectionState);

		await rm(root, { recursive: true, force: true });
	});

	test("regenerates markdown world-state reports alongside the projection", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-projection-reports-"),
		);
		const bardoRoot = path.join(root, "bardo");

		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-report-1",
				type: "player_action_resolved",
				atISO: "2026-02-23T02:30:00.000Z",
				source: "player_action",
				data: {
					action: "I question the ferrymaster about the missing tax barge",
					worldTimeAfterISO: "2026-02-23T02:30:00.000Z",
					locationAfter: "river-market",
					createdNpcIds: ["ferrymaster"],
					createdLocationIds: ["river-market"],
				},
			},
		});

		await regenerateCurrentStateProjection({ bardoRoot });

		const reportPaths = [
			"logs/world-state-overview.md",
			"logs/continuity-audit.md",
			"logs/timeline-diff.md",
			"logs/faction-pressure.md",
			"logs/player-knowledge.md",
			"logs/canon-vs-inference.md",
		];

		for (const reportPath of reportPaths) {
			const raw = await readFile(path.join(bardoRoot, reportPath), "utf8");
			expect(raw).toContain("## Canon");
			expect(raw).toContain("## Inference");
			expect(raw).toContain("## Suggestion");
		}

		const worldStateOverview = await readFile(
			path.join(bardoRoot, "logs/world-state-overview.md"),
			"utf8",
		);
		expect(worldStateOverview).toContain("river-market");
		expect(worldStateOverview).toContain("evt-report-1");

		const continuityAudit = await readFile(
			path.join(bardoRoot, "logs/continuity-audit.md"),
			"utf8",
		);
		expect(continuityAudit).toContain("Consistency check");
		expect(continuityAudit).toContain("events/canonical.ndjson");

		await rm(root, { recursive: true, force: true });
	});

	test("short-circuits when the projection is already current", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-projection-short-circuit-"),
		);
		const bardoRoot = path.join(root, "bardo");

		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-short-circuit-1",
				type: "player_action_resolved",
				atISO: "2026-02-23T03:00:00.000Z",
				source: "player_action",
				data: {
					action: "I inspect the lantern pier",
					worldTimeAfterISO: "2026-02-23T03:00:00.000Z",
					locationAfter: "lantern-pier",
					createdLocationIds: ["lantern-pier"],
					stateAfter: {
						worldTimeISO: "2026-02-23T03:00:00.000Z",
						currentLocation: "lantern-pier",
						counters: { unknownNpc: 0, unknownLocation: 1 },
						locations: {
							"lantern-pier": {
								name: "Lantern Pier",
								visits: 1,
								npcIds: [],
							},
						},
						lastAction: "I inspect the lantern pier",
					},
				},
			},
		});

		const first = await regenerateCurrentStateProjection({ bardoRoot });
		const firstRaw = await readFile(first.projectionPath, "utf8");
		const firstParsed = parseMarkdown(firstRaw);

		await Bun.sleep(20);
		const second = await regenerateCurrentStateProjection({ bardoRoot });
		const secondRaw = await readFile(second.projectionPath, "utf8");
		const secondParsed = parseMarkdown(secondRaw);

		expect(second.eventCount).toBe(1);
		expect(second.state.currentLocation).toBe("lantern-pier");
		expect(secondRaw).toBe(firstRaw);
		expect(secondParsed.frontmatter.generated_at_iso).toBe(
			firstParsed.frontmatter.generated_at_iso,
		);

		await rm(root, { recursive: true, force: true });
	});
});
