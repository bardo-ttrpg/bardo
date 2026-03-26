import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendCanonicalEvent } from "../events/store";
import { renderMarkdown } from "../markdown/markdown";
import { regenerateCurrentStateProjection } from "./current-state";
import { loadPreferredCurrentState } from "./preferred-state";

describe("loadPreferredCurrentState", () => {
	test("accepts projections when newer canonical events are irrelevant to the projection", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-preferred-state-"),
		);
		const bardoRoot = path.join(root, "bardo");

		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-player-action-1",
				type: "player_action_resolved",
				atISO: "2026-03-05T00:00:00.000Z",
				source: "player_action",
				data: {
					action: "I arrive in thornwick",
					worldTimeAfterISO: "2026-03-05T00:00:00.000Z",
					locationAfter: "thornwick",
					createdNpcIds: [],
					createdLocationIds: ["thornwick"],
				},
			},
		});
		await regenerateCurrentStateProjection({ bardoRoot });
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-domain-transition-1",
				type: "domain_transition_applied",
				atISO: "2026-03-05T00:05:00.000Z",
				source: "apply_domain_transition",
				data: {
					domain: "entity",
					recordId: "thornwick-guard",
					transition: "create",
					payload: {},
				},
			},
		});

		const preferred = await loadPreferredCurrentState({
			bardoRoot,
			consumer: "test",
			strictCanonicalMode: true,
		});

		expect(preferred.source).toBe("projection");
		expect(preferred.chosen.state.currentLocation).toBe("thornwick");

		await rm(root, { recursive: true, force: true });
	});

	test("throws when the persisted projection state is malformed", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-preferred-state-malformed-projection-"),
		);
		const bardoRoot = path.join(root, "bardo");
		const projectionPath = path.join(bardoRoot, "projections/current-state.md");
		await mkdir(path.dirname(projectionPath), { recursive: true });
		await writeFile(
			projectionPath,
			renderMarkdown(
				{
					title: "Current State Projection",
					projection_schema: "v2",
				},
				"{not valid json",
			),
			"utf8",
		);

		await expect(
			loadPreferredCurrentState({
				bardoRoot,
				consumer: "test",
			}),
		).rejects.toThrow("MALFORMED_CAMPAIGN_STATE");

		await rm(root, { recursive: true, force: true });
	});
});
