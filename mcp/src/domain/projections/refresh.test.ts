import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendCanonicalEvent } from "../events/store";
import {
	projectionIdsForEventTypes,
	regenerateProjectionsForEventTypes,
} from "./refresh";

describe("projection refresh dependencies", () => {
	test("maps triggering event types to dependent projections", () => {
		const projections = projectionIdsForEventTypes([
			"player_action_resolved",
			"dice_rolled",
		]);
		expect(projections).toEqual(["current_state"]);
	});

	test("returns empty list for non-projecting event types", () => {
		const projections = projectionIdsForEventTypes(["runtime_policy_blocked"]);
		expect(projections).toEqual([]);
	});

	test("regenerates only dependent projections for given event types", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-projection-refresh-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-refresh-1",
				type: "player_action_resolved",
				atISO: "2026-02-23T06:00:00.000Z",
				source: "test",
				data: {
					action: "I wait and watch.",
					worldTimeAfterISO: "2026-02-23T06:00:00.000Z",
					locationAfter: "starting-area",
					createdLocationIds: [],
					createdNpcIds: [],
				},
			},
		});

		const refreshed = await regenerateProjectionsForEventTypes({
			bardoRoot,
			eventTypes: ["player_action_resolved"],
		});

		expect(refreshed.length).toBe(1);
		expect(refreshed[0]?.projectionId).toBe("current_state");
		expect(refreshed[0]?.eventCount).toBe(1);

		await rm(root, { recursive: true, force: true });
	});
});
