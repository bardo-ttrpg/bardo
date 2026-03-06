import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readCanonicalEvents } from "../../../domain/events/store";
import {
	parseMarkdown,
	renderMarkdown,
} from "../../../domain/markdown/markdown";
import { readTextIfExists } from "../../../infra/filesystem/filesystem";
import {
	renderPrometheusMetrics,
	resetTelemetryForTests,
} from "../../../telemetry";
import type { AuthContext } from "../../../types/contracts";
import { registerWorldSyncTool } from "./register";
import type { WorldSyncOutput } from "./schemas";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type WorldSyncHandler = (args: {
	transcript?: string;
	currentLocationHint?: string;
	discoveries?: Array<{
		kind: "npc" | "location" | "faction" | "item" | "clue" | "thread";
		id?: string;
		displayName: string;
		discoveryMode:
			| "explicitly_named"
			| "implicitly_present"
			| "role_placeholder";
		confidence: "high" | "medium" | "low";
		metadata?: Record<string, unknown>;
	}>;
}) => ToolResult<WorldSyncOutput>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureWorldSyncHandler(args: {
	auth: AuthContext;
}): WorldSyncHandler {
	let handler: WorldSyncHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: WorldSyncHandler,
		): void => {
			if (name === "world_sync") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerWorldSyncTool(server, args.auth);
	if (!handler) {
		throw new Error("Failed to register world_sync.");
	}
	return handler;
}

describe("world_sync tool", () => {
	test("appends canonical world_sync event and refreshes projection", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-world-sync-"));
		const bardoRoot = path.join(root, "bardo");
		const worldSync = captureWorldSyncHandler({ auth: createAuth(root) });

		const result = await worldSync({
			transcript: 'welcome to River Market. "I am Mira."',
		});
		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.currentLocationAfter).toBe("river-market");

		const events = await readCanonicalEvents({ bardoRoot });
		expect(events.some((event) => event.type === "world_sync_applied")).toBe(
			true,
		);
		const projectionRaw = await readFile(
			path.join(bardoRoot, "projections/current-state.md"),
			"utf8",
		);
		const projectionState = JSON.parse(
			parseMarkdown(projectionRaw).content,
		) as {
			currentLocation: string;
			lastAction: string;
		};
		expect(projectionState.currentLocation).toBe("river-market");
		expect(projectionState.lastAction).toBe("world_sync");
		const legacyState = await readTextIfExists(
			path.join(bardoRoot, "state/current.md"),
		);
		const legacyHistory = await readTextIfExists(
			path.join(bardoRoot, "state/history.md"),
		);
		expect(legacyState).toBeString();
		expect(legacyHistory).toBeNull();
		expect(JSON.parse(parseMarkdown(legacyState ?? "").content)).toEqual(
			projectionState,
		);

		await rm(root, { recursive: true, force: true });
	});

	test("blocks transcript that violates table contract boundary", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-world-sync-policy-"),
		);
		const bardoRoot = path.join(root, "bardo");
		const worldSync = captureWorldSyncHandler({ auth: createAuth(root) });

		const result = await worldSync({
			transcript: "The scene includes sexual violence in detail.",
		});
		expect(result.isError).toBe(true);
		expect(result.structuredContent.success).toBe(false);

		const events = await readCanonicalEvents({ bardoRoot });
		expect(events.length).toBe(1);
		expect(events[0]?.type).toBe("runtime_policy_blocked");

		await rm(root, { recursive: true, force: true });
	});

	test("blocks legacy fallback reads in strict canonical mode before mutations", async () => {
		resetTelemetryForTests();
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-world-sync-strict-legacy-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await mkdir(path.join(bardoRoot, "state"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{
					title: "Campaign State",
					description: "Legacy state",
				},
				JSON.stringify({ currentLocation: "legacy-town" }, null, 2),
			),
			"utf8",
		);
		const worldSync = captureWorldSyncHandler({ auth: createAuth(root) });

		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "true";
		try {
			const result = await worldSync({
				transcript: 'A new landmark is called "Old Bell Plaza."',
			});
			expect(result.isError).toBe(true);
			expect(result.structuredContent.success).toBe(false);
			expect(result.structuredContent.message).toContain(
				"STRICT_CANONICAL_LEGACY_FALLBACK_BLOCKED",
			);
			const events = await readCanonicalEvents({ bardoRoot });
			expect(events.length).toBe(0);
			expect(renderPrometheusMetrics()).toContain(
				'bardo_legacy_fallback_reads_total{consumer="world_sync",outcome="blocked",strictmode="true"} 1',
			);
		} finally {
			if (previousStrict === undefined) {
				delete Bun.env.BARDO_STRICT_CANONICAL_MODE;
			} else {
				Bun.env.BARDO_STRICT_CANONICAL_MODE = previousStrict;
			}
			await rm(root, { recursive: true, force: true });
		}
	});

	test("materializes hinted current location before persisting world sync state", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-world-sync-location-hint-"),
		);
		const bardoRoot = path.join(root, "bardo");
		const worldSync = captureWorldSyncHandler({ auth: createAuth(root) });

		const result = await worldSync({
			transcript: 'The courier says, "We should move quickly."',
			currentLocationHint: "Thornwick",
		});
		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.currentLocationAfter).toBe("thornwick");

		const projectionRaw = await readFile(
			path.join(bardoRoot, "projections/current-state.md"),
			"utf8",
		);
		const projectionState = JSON.parse(
			parseMarkdown(projectionRaw).content,
		) as {
			currentLocation: string;
			locations: Record<string, { name: string }>;
		};
		expect(projectionState.currentLocation).toBe("thornwick");
		expect(projectionState.locations.thornwick?.name).toBe("Thornwick");

		const locationFile = await readTextIfExists(
			path.join(bardoRoot, "world/locations/thornwick.md"),
		);
		expect(locationFile).not.toBeNull();

		await rm(root, { recursive: true, force: true });
	});

	test("accepts structured discoveries and uses them as the primary sync source", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-world-sync-structured-"),
		);
		const bardoRoot = path.join(root, "bardo");
		const worldSync = captureWorldSyncHandler({ auth: createAuth(root) });

		const result = await worldSync({
			currentLocationHint: "Oakrest Village",
			discoveries: [
				{
					kind: "location",
					displayName: "Whispering Willow Tavern",
					discoveryMode: "explicitly_named",
					confidence: "high",
				},
				{
					kind: "npc",
					displayName: "Garrick",
					discoveryMode: "explicitly_named",
					confidence: "high",
					metadata: {
						role: "barkeep",
					},
				},
				{
					kind: "thread",
					displayName: "Thomas Whitmore Disappearance",
					discoveryMode: "implicitly_present",
					confidence: "medium",
				},
			],
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.currentLocationAfter).toBe(
			"whispering-willow-tavern",
		);

		const events = await readCanonicalEvents({ bardoRoot });
		const syncEvent = events.find(
			(event) => event.type === "world_sync_applied",
		);
		expect(syncEvent).toBeDefined();
		expect(syncEvent?.data.extractedLocationNames).toEqual([
			"Whispering Willow Tavern",
		]);
		expect(syncEvent?.data.extractedNpcNames).toEqual(["Garrick"]);
		expect(syncEvent?.data.persistedDiscoveries).toBeArray();
		expect(
			(syncEvent?.data.persistedDiscoveries as Array<{ kind: string }>).some(
				(discovery) => discovery.kind === "thread",
			),
		).toBe(true);

		await rm(root, { recursive: true, force: true });
	});

	test("extracts disappearance discoveries from transcript without turning locations into NPCs", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-world-sync-disappearance-"),
		);
		const bardoRoot = path.join(root, "bardo");
		const worldSync = captureWorldSyncHandler({ auth: createAuth(root) });

		const result = await worldSync({
			currentLocationHint: "Thornwick",
			transcript:
				'Brenna lowers her voice. "First was Marek the miller. He vanished near the Twilight Forest three weeks ago."',
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.currentLocationAfter).toBe("thornwick");

		const events = await readCanonicalEvents({ bardoRoot });
		const syncEvent = events.findLast(
			(event) => event.type === "world_sync_applied",
		);
		expect(syncEvent).toBeDefined();
		expect(syncEvent?.data.extractedNpcNames).toContain("Marek");
		expect(syncEvent?.data.extractedNpcNames).not.toContain("Forest");
		expect(syncEvent?.data.extractedLocationNames).toContain("Twilight Forest");
		expect(
			(
				syncEvent?.data.persistedDiscoveries as Array<{
					kind: string;
					id: string;
				}>
			).some(
				(discovery) =>
					discovery.kind === "thread" &&
					discovery.id === "thornwick-disappearances",
			),
		).toBe(true);

		const projectionRaw = await readFile(
			path.join(bardoRoot, "projections/current-state.md"),
			"utf8",
		);
		const projectionState = JSON.parse(
			parseMarkdown(projectionRaw).content,
		) as {
			npcs: Record<string, { displayName: string }>;
			locations: Record<string, { name: string }>;
			threads: Record<string, { title: string }>;
		};
		expect(projectionState.npcs.marek?.displayName).toBe("Marek");
		expect(projectionState.npcs.forest).toBeUndefined();
		expect(projectionState.locations["twilight-forest"]?.name).toBe(
			"Twilight Forest",
		);
		expect(projectionState.threads["thornwick-disappearances"]?.title).toBe(
			"Thornwick disappearances",
		);

		await rm(root, { recursive: true, force: true });
	});

	test("preserves semantic ids from structured discoveries and location hints", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-world-sync-semantic-ids-"),
		);
		const bardoRoot = path.join(root, "bardo");
		const worldSync = captureWorldSyncHandler({ auth: createAuth(root) });

		const result = await worldSync({
			currentLocationHint: "loc_tavern_starting-area",
			discoveries: [
				{
					kind: "location",
					id: "loc_tavern_starting-area",
					displayName: "Tavern at Starting Area",
					discoveryMode: "implicitly_present",
					confidence: "high",
				},
				{
					kind: "npc",
					id: "npc_barkeep_starting-area_01",
					displayName: "Unknown Barkeep",
					discoveryMode: "role_placeholder",
					confidence: "medium",
					metadata: {
						role: "barkeep",
						locationId: "loc_tavern_starting-area",
					},
				},
			],
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.currentLocationAfter).toBe(
			"loc_tavern_starting-area",
		);
		expect(result.structuredContent.createdLocationIds).toEqual([
			"loc_tavern_starting-area",
		]);
		expect(result.structuredContent.createdNpcIds).toEqual([
			"npc_barkeep_starting-area_01",
		]);

		const projectionRaw = await readFile(
			path.join(bardoRoot, "projections/current-state.md"),
			"utf8",
		);
		const projectionState = JSON.parse(
			parseMarkdown(projectionRaw).content,
		) as {
			currentLocation: string;
			locations: Record<string, { name: string }>;
			npcs: Record<string, { currentLocation: string }>;
		};
		expect(projectionState.currentLocation).toBe("loc_tavern_starting-area");
		expect(projectionState.locations["loc_tavern_starting-area"]?.name).toBe(
			"Tavern at Starting Area",
		);
		expect(projectionState.locations["loctavernstarting-area"]).toBeUndefined();
		expect(
			projectionState.npcs["npc_barkeep_starting-area_01"]?.currentLocation,
		).toBe("loc_tavern_starting-area");
		expect(projectionState.npcs["npcbarkeepstarting-area01"]).toBeUndefined();

		await rm(root, { recursive: true, force: true });
	});

	test("reconciles a named NPC onto an existing placeholder npc id", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-world-sync-npc-reconcile-"),
		);
		const bardoRoot = path.join(root, "bardo");
		const worldSync = captureWorldSyncHandler({ auth: createAuth(root) });

		const initial = await worldSync({
			currentLocationHint: "Thornwick",
			discoveries: [
				{
					kind: "location",
					id: "loc_tavern_thornwick",
					displayName: "Tavern at Thornwick",
					discoveryMode: "implicitly_present",
					confidence: "high",
				},
				{
					kind: "npc",
					id: "npc_barkeep_thornwick_01",
					displayName: "Unknown Barkeep",
					discoveryMode: "role_placeholder",
					confidence: "medium",
					metadata: {
						role: "barkeep",
						locationId: "loc_tavern_thornwick",
					},
				},
			],
		});
		expect(initial.isError).toBe(false);

		const reconciled = await worldSync({
			currentLocationHint: "loc_tavern_thornwick",
			discoveries: [
				{
					kind: "npc",
					id: "npc_barkeep_thornwick_01",
					displayName: "Brenna",
					discoveryMode: "explicitly_named",
					confidence: "high",
					metadata: {
						role: "barkeep",
						locationId: "loc_tavern_thornwick",
					},
				},
			],
		});

		expect(reconciled.isError).toBe(false);
		expect(reconciled.structuredContent.success).toBe(true);

		const projectionRaw = await readFile(
			path.join(bardoRoot, "projections/current-state.md"),
			"utf8",
		);
		const projectionState = JSON.parse(
			parseMarkdown(projectionRaw).content,
		) as {
			npcs: Record<
				string,
				{ displayName: string; aliases: string[]; discovered: boolean }
			>;
		};
		expect(projectionState.npcs.npc_barkeep_thornwick_01?.displayName).toBe(
			"Brenna",
		);
		expect(
			projectionState.npcs.npc_barkeep_thornwick_01?.aliases ?? [],
		).toContain("Unknown Barkeep");
		expect(projectionState.npcs.npc_barkeep_thornwick_01?.discovered).toBe(
			true,
		);

		const npcFile = await readTextIfExists(
			path.join(bardoRoot, "entities/npc_barkeep_thornwick_01.md"),
		);
		expect(npcFile).not.toBeNull();
		const npcData = JSON.parse(parseMarkdown(npcFile ?? "").content) as {
			publicName: string;
			trueName: string;
		};
		expect(npcData.publicName).toBe("Brenna");
		expect(npcData.trueName).toBe("Brenna");

		await rm(root, { recursive: true, force: true });
	});
});
