import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	appendCanonicalEvent,
	appendCanonicalEvents,
	readCanonicalEvents,
	replayCanonicalEvents,
} from "./store";

async function makeTempRoot(prefix: string): Promise<string> {
	return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("canonical event store", () => {
	test("appends events in order and replays them", async () => {
		const root = await makeTempRoot("bardo-events-order-");
		const bardoRoot = path.join(root, "bardo");

		const first = await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-001",
				type: "scene_started",
				atISO: "2026-01-01T00:00:00.000Z",
				source: "test",
				data: {
					sceneId: "scene-1",
				},
			},
		});

		const second = await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-002",
				type: "player_action_declared",
				atISO: "2026-01-01T00:01:00.000Z",
				source: "test",
				data: {
					action: "I open the door.",
				},
			},
		});

		expect(first.sequence).toBe(1);
		expect(second.sequence).toBe(2);

		const replayed = await replayCanonicalEvents({ bardoRoot });
		expect(replayed.length).toBe(2);
		expect(replayed[0]?.id).toBe("evt-001");
		expect(replayed[1]?.id).toBe("evt-002");
		expect(replayed[1]?.data.action).toBe("I open the door.");

		const raw = await readCanonicalEvents({ bardoRoot });
		expect(raw.length).toBe(2);
		expect(raw[0]?.sequence).toBe(1);
		expect(raw[1]?.sequence).toBe(2);

		const metadataRaw = await readFile(
			path.join(bardoRoot, "_settings/canonical-event-log-meta.json"),
			"utf8",
		);
		const metadata = JSON.parse(metadataRaw) as {
			lastSequence: number;
			eventCount: number;
			eventIds: Record<string, number>;
		};
		expect(metadata.lastSequence).toBe(2);
		expect(metadata.eventCount).toBe(2);
		expect(metadata.eventIds["evt-001"]).toBe(1);
		expect(metadata.eventIds["evt-002"]).toBe(2);

		await rm(root, { recursive: true, force: true });
	});

	test("rejects duplicate event ids", async () => {
		const root = await makeTempRoot("bardo-events-dup-");
		const bardoRoot = path.join(root, "bardo");

		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-dup-1",
				type: "scene_started",
				atISO: "2026-01-01T00:00:00.000Z",
				source: "test",
				data: {},
			},
		});

		await expect(
			appendCanonicalEvent({
				bardoRoot,
				event: {
					id: "evt-dup-1",
					type: "scene_started",
					atISO: "2026-01-01T00:01:00.000Z",
					source: "test",
					data: {},
				},
			}),
		).rejects.toThrow("already exists");

		await rm(root, { recursive: true, force: true });
	});

	test("returns empty replay when no event log exists", async () => {
		const root = await makeTempRoot("bardo-events-empty-");
		const bardoRoot = path.join(root, "bardo");

		const replayed = await replayCanonicalEvents({ bardoRoot });
		expect(replayed).toEqual([]);

		await rm(root, { recursive: true, force: true });
	});

	test("repairs malformed append metadata while preserving canonical ordering", async () => {
		const root = await makeTempRoot("bardo-events-meta-repair-");
		const bardoRoot = path.join(root, "bardo");

		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-100",
				type: "scene_started",
				atISO: "2026-01-01T00:00:00.000Z",
				source: "test",
				data: {},
			},
		});

		await Bun.write(
			path.join(bardoRoot, "_settings/canonical-event-log-meta.json"),
			"{not-json",
		);

		const second = await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-101",
				type: "player_action_declared",
				atISO: "2026-01-01T00:01:00.000Z",
				source: "test",
				data: {},
			},
		});

		expect(second.sequence).toBe(2);
		const metadataRaw = await readFile(
			path.join(bardoRoot, "_settings/canonical-event-log-meta.json"),
			"utf8",
		);
		const metadata = JSON.parse(metadataRaw) as {
			lastSequence: number;
			eventCount: number;
			eventIds: Record<string, number>;
		};
		expect(metadata.lastSequence).toBe(2);
		expect(metadata.eventCount).toBe(2);
		expect(metadata.eventIds["evt-100"]).toBe(1);
		expect(metadata.eventIds["evt-101"]).toBe(2);

		await rm(root, { recursive: true, force: true });
	});

	test("batch appends canonical events while preserving sequence and metadata", async () => {
		const root = await makeTempRoot("bardo-events-batch-");
		const bardoRoot = path.join(root, "bardo");

		const stored = await appendCanonicalEvents({
			bardoRoot,
			events: [
				{
					id: "evt-batch-001",
					type: "scene_started",
					atISO: "2026-01-01T00:00:00.000Z",
					source: "test",
					data: {},
				},
				{
					id: "evt-batch-002",
					type: "player_action_declared",
					atISO: "2026-01-01T00:01:00.000Z",
					source: "test",
					data: {},
				},
			],
		});

		expect(stored).toHaveLength(2);
		expect(stored[0]?.sequence).toBe(1);
		expect(stored[1]?.sequence).toBe(2);

		const replayed = await readCanonicalEvents({ bardoRoot });
		expect(replayed).toHaveLength(2);
		expect(replayed[1]?.id).toBe("evt-batch-002");

		const metadataRaw = await readFile(
			path.join(bardoRoot, "_settings/canonical-event-log-meta.json"),
			"utf8",
		);
		const metadata = JSON.parse(metadataRaw) as {
			lastSequence: number;
			eventCount: number;
			eventIds: Record<string, number>;
		};
		expect(metadata.lastSequence).toBe(2);
		expect(metadata.eventCount).toBe(2);
		expect(metadata.eventIds["evt-batch-001"]).toBe(1);
		expect(metadata.eventIds["evt-batch-002"]).toBe(2);

		await rm(root, { recursive: true, force: true });
	});
});
