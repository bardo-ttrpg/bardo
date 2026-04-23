import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	bootstrapCampaignWorkspace,
	type CampaignBootstrapReadiness,
} from "./campaign-bootstrap";
import { computeStateHash } from "./runtime-contracts";
import { replayCommittedState } from "./runtime-tools";
import { resolveBardoRoot } from "./workspace";

describe("bootstrapCampaignWorkspace", () => {
	test("generates the required campaign artifacts after rules bootstrap is complete", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-campaign-bootstrap-"),
		);
		const bardoRoot = resolveBardoRoot(workspaceRoot);

		try {
			await mkdir(path.join(bardoRoot, "rules/normalized"), {
				recursive: true,
			});
			await writeFile(
				path.join(bardoRoot, "rules/normalized/index.json"),
				JSON.stringify({
					recommendedSimulationDepth: "deep",
					sections: [{ title: "Combat", tags: ["combat"] }],
				}),
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, "campaign-notes.md"),
				[
					"# Campaign Notes",
					"",
					"Location: River Market",
					"Quest: Find the ferryman",
					"Faction: Dock Wardens",
					"Event: The bridge collapsed yesterday.",
				].join("\n"),
				"utf8",
			);

			const result = await bootstrapCampaignWorkspace({
				workspaceRoot,
				bardoRoot,
				nowIso: "2026-04-09T00:00:00.000Z",
			});

			expect(result.readiness.status).toBe("ready");
			expect(result.sourceIndexPath).toBe("manifests/source-index.json");
			expect(result.currentStatePath).toBe("state/current-state.json");
			expect(result.trackingProfilePath).toBe(
				"simulation/tracking-profile.json",
			);
			expect(result.readinessPath).toBe("manifests/readiness.json");

			const sourceIndex = JSON.parse(
				await readFile(path.join(bardoRoot, result.sourceIndexPath), "utf8"),
			) as { sources: Array<{ relativePath: string; role: string }> };
			expect(
				sourceIndex.sources.some((entry) => entry.role === "campaign-file"),
			).toBe(true);

			const currentState = JSON.parse(
				await readFile(path.join(bardoRoot, result.currentStatePath), "utf8"),
			) as { currentLocation: string | null; activeQuests: string[] };
			expect(currentState.currentLocation).toBe("River Market");
			expect(currentState.activeQuests).toContain("Find the ferryman");

			const readiness = JSON.parse(
				await readFile(path.join(bardoRoot, result.readinessPath), "utf8"),
			) as { status: CampaignBootstrapReadiness; gaps: string[] };
			expect(readiness.status).toBe("ready");
			expect(readiness.gaps).toEqual([]);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("returns needs-user-input when rules bootstrap has not completed", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-campaign-bootstrap-"),
		);
		const bardoRoot = resolveBardoRoot(workspaceRoot);

		try {
			await mkdir(bardoRoot, { recursive: true });
			const result = await bootstrapCampaignWorkspace({
				workspaceRoot,
				bardoRoot,
				nowIso: "2026-04-09T00:00:00.000Z",
			});

			expect(result.readiness.status).toBe("needs-user-input");
			expect(result.readiness.gaps).toContain(
				"Rules bootstrap must complete before campaign bootstrap can begin.",
			);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("derives richer state and explicit gaps from messy campaign notes", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-campaign-bootstrap-"),
		);
		const bardoRoot = resolveBardoRoot(workspaceRoot);

		try {
			await mkdir(path.join(bardoRoot, "rules/normalized"), {
				recursive: true,
			});
			await writeFile(
				path.join(bardoRoot, "rules/normalized/index.json"),
				JSON.stringify({
					recommendedSimulationDepth: "deep",
					sections: [{ title: "Travel", tags: ["travel"] }],
				}),
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, "session-12.md"),
				[
					"# Session 12",
					"",
					"We left River Market before sunrise and reached Ash Court by dusk.",
					"Current situation: The ferry charter still isn't secured.",
					"Active quest: Find the ferryman before the eclipse.",
					"Faction in play: Dock Wardens want payment up front.",
					"Recent event: The old bridge collapsed after the storm.",
					"Uncertainty: Nobody knows whether the eclipse cult arrived first.",
				].join("\n"),
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, "contradictions.txt"),
				[
					"Possible location: River Market if the caravan turned back.",
					"Quest lead: Speak to Mira about the missing charter.",
				].join("\n"),
				"utf8",
			);

			const result = await bootstrapCampaignWorkspace({
				workspaceRoot,
				bardoRoot,
				nowIso: "2026-04-09T00:00:00.000Z",
			});

			expect(result.readiness.status).toBe("ready-with-gaps");

			const currentState = JSON.parse(
				await readFile(path.join(bardoRoot, result.currentStatePath), "utf8"),
			) as {
				currentLocation: string | null;
				activeQuests: string[];
				relevantFactions: string[];
				recentEvents: string[];
				uncertainties: string[];
			};
			expect(currentState.currentLocation).toBe("Ash Court");
			expect(currentState.activeQuests).toEqual(
				expect.arrayContaining(["Find the ferryman before the eclipse"]),
			);
			expect(currentState.relevantFactions).toEqual(
				expect.arrayContaining(["Dock Wardens"]),
			);
			expect(currentState.recentEvents).toEqual(
				expect.arrayContaining([
					expect.stringContaining("bridge collapsed after the storm"),
				]),
			);
			expect(currentState.uncertainties).toEqual(
				expect.arrayContaining([
					expect.stringContaining("eclipse cult"),
					expect.stringContaining("River Market"),
				]),
			);

			const readiness = JSON.parse(
				await readFile(path.join(bardoRoot, result.readinessPath), "utf8"),
			) as { status: CampaignBootstrapReadiness; gaps: string[] };
			expect(readiness.status).toBe("ready-with-gaps");
			expect(readiness.gaps).toEqual(
				expect.arrayContaining([expect.stringContaining("contradictory")]),
			);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("indexes nearby named locations mentioned in prose without overriding the current location", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-campaign-bootstrap-"),
		);
		const bardoRoot = resolveBardoRoot(workspaceRoot);

		try {
			await mkdir(path.join(bardoRoot, "rules/normalized"), {
				recursive: true,
			});
			await writeFile(
				path.join(bardoRoot, "rules/normalized/index.json"),
				JSON.stringify({
					recommendedSimulationDepth: "deep",
					sections: [{ title: "Travel", tags: ["travel"] }],
				}),
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, "campaign-notes.md"),
				[
					"# Campaign Notes",
					"",
					"Current location: River Market",
					"Active quest: Find the ferryman before midnight.",
					"Mira believes the ferryman is hiding near Ash Court.",
				].join("\n"),
				"utf8",
			);

			const result = await bootstrapCampaignWorkspace({
				workspaceRoot,
				bardoRoot,
				nowIso: "2026-04-09T00:00:00.000Z",
			});

			const entities = JSON.parse(
				await readFile(path.join(bardoRoot, result.entitiesPath), "utf8"),
			) as { locations: string[] };
			const currentState = JSON.parse(
				await readFile(path.join(bardoRoot, result.currentStatePath), "utf8"),
			) as { currentLocation: string | null };

			expect(entities.locations).toEqual(
				expect.arrayContaining(["River Market", "Ash Court"]),
			);
			expect(currentState.currentLocation).toBe("River Market");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("extracts richer continuity signals for faction pressure, npc attitudes, facts, and time", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-campaign-bootstrap-"),
		);
		const bardoRoot = resolveBardoRoot(workspaceRoot);

		try {
			await mkdir(path.join(bardoRoot, "rules/normalized"), {
				recursive: true,
			});
			await writeFile(
				path.join(bardoRoot, "rules/normalized/index.json"),
				JSON.stringify({
					recommendedSimulationDepth: "deep",
					sections: [{ title: "Downtime", tags: ["faction", "time"] }],
				}),
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, "session-13.md"),
				[
					"# Session 13",
					"",
					"Current location: Ash Court",
					"Active quest: Find the ferryman before the eclipse.",
					"Faction in play: Guild of Keys",
					"Fact revealed: The ferryman answers to the Guild of Keys.",
					"Faction consequence: Guild of Keys tightened patrols in Ash Court.",
					"NPC attitude: Mira -> wary",
					"Clock progress: Eclipse Clock advanced to 2/6.",
					"Recent event: The bridge collapsed yesterday.",
				].join("\n"),
				"utf8",
			);

			const result = await bootstrapCampaignWorkspace({
				workspaceRoot,
				bardoRoot,
				nowIso: "2026-04-09T00:00:00.000Z",
			});

			const currentState = JSON.parse(
				await readFile(path.join(bardoRoot, result.currentStatePath), "utf8"),
			) as {
				factsRevealed: string[];
				factionConsequences: string[];
				clockProgress: string[];
				npcAttitudes: Record<string, string>;
			};
			const trackingProfile = JSON.parse(
				await readFile(
					path.join(bardoRoot, result.trackingProfilePath),
					"utf8",
				),
			) as {
				strong: string[];
				light: string[];
			};

			expect(currentState.factsRevealed).toEqual(
				expect.arrayContaining(["The ferryman answers to the Guild of Keys."]),
			);
			expect(currentState.factionConsequences).toEqual(
				expect.arrayContaining([
					"Guild of Keys tightened patrols in Ash Court.",
				]),
			);
			expect(currentState.clockProgress).toEqual(
				expect.arrayContaining(["Eclipse Clock advanced to 2/6."]),
			);
			expect(currentState.npcAttitudes).toMatchObject({
				Mira: "wary",
			});
			expect(trackingProfile.strong).toEqual(
				expect.arrayContaining(["factionConsequences", "clockProgress"]),
			);
			expect(trackingProfile.light).toEqual(
				expect.arrayContaining(["npcContinuity"]),
			);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("writes versioned identity-rich artifacts with minimal world simulation metadata", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-campaign-bootstrap-"),
		);
		const bardoRoot = resolveBardoRoot(workspaceRoot);

		try {
			await mkdir(path.join(bardoRoot, "rules/normalized"), {
				recursive: true,
			});
			await writeFile(
				path.join(bardoRoot, "rules/normalized/index.json"),
				JSON.stringify({
					recommendedSimulationDepth: "deep",
					sections: [{ title: "Downtime", tags: ["faction", "time"] }],
				}),
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, "session-14.md"),
				[
					"# Session 14",
					"",
					"Current location: Ash Court",
					"Active quest: Find the ferryman before the eclipse.",
					"Faction in play: Guild of Keys",
					"Faction consequence: Guild of Keys tightened patrols in Ash Court.",
					"NPC attitude: Mira -> wary",
					"Clock progress: Eclipse Clock advanced to 2/6.",
				].join("\n"),
				"utf8",
			);

			const result = await bootstrapCampaignWorkspace({
				workspaceRoot,
				bardoRoot,
				nowIso: "2026-04-10T12:00:00.000Z",
			});

			const entities = JSON.parse(
				await readFile(path.join(bardoRoot, result.entitiesPath), "utf8"),
			) as {
				schemaVersion?: number;
				records?: {
					characters?: Array<{
						id: string;
						name: string;
						aliases: string[];
						sourcePaths: string[];
					}>;
					locations?: Array<{
						id: string;
						name: string;
						aliases: string[];
						sourcePaths: string[];
					}>;
				};
			};
			expect(entities.schemaVersion).toBe(2);
			expect(entities.records?.characters).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: "character:mira",
						name: "Mira",
						aliases: ["Mira"],
						sourcePaths: ["session-14.md"],
					}),
				]),
			);
			expect(entities.records?.locations).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: "location:ash-court",
						name: "Ash Court",
						aliases: ["Ash Court"],
						sourcePaths: ["session-14.md"],
					}),
				]),
			);

			const currentState = JSON.parse(
				await readFile(path.join(bardoRoot, result.currentStatePath), "utf8"),
			) as {
				schemaVersion?: number;
				worldTime?: {
					currentDateTimeISO: string;
					lastAdvancedByEventId: string | null;
				};
				activeClocks?: Array<{
					id: string;
					name: string;
					progress: string;
					confidence: string;
				}>;
				unresolvedConsequences?: string[];
				factionPressure?: Record<string, number>;
				fieldMetadata?: {
					currentLocation?: {
						entityId: string;
						confidence: string;
						provenance: {
							sourceType: string;
							sourcePath: string;
						};
					};
				};
			};
			expect(currentState.schemaVersion).toBe(2);
			expect(currentState.worldTime).toEqual({
				currentDateTimeISO: "2026-04-10T12:00:00.000Z",
				lastAdvancedByEventId: null,
			});
			expect(currentState.activeClocks).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: "clock:eclipse-clock",
						name: "Eclipse Clock",
						progress: "Eclipse Clock advanced to 2/6.",
						confidence: "validated-derived",
					}),
				]),
			);
			expect(currentState.unresolvedConsequences).toEqual(
				expect.arrayContaining([
					"Guild of Keys tightened patrols in Ash Court.",
				]),
			);
			expect(currentState.factionPressure).toMatchObject({
				"faction:guild-of-keys": 1,
			});
			expect(currentState.fieldMetadata?.currentLocation).toMatchObject({
				entityId: "location:ash-court",
				confidence: "confirmed",
				provenance: {
					sourceType: "campaign-file",
					sourcePath: "session-14.md",
				},
			});

			const snapshotIndex = JSON.parse(
				await readFile(path.join(bardoRoot, "snapshots/index.json"), "utf8"),
			) as {
				snapshots?: Array<{ reason: string; replayPosition?: { eventIndex?: number } }>;
			};
			expect(snapshotIndex.snapshots).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						reason: "bootstrap",
						replayPosition: expect.objectContaining({ eventIndex: 1 }),
					}),
				]),
			);

			const eventLog = (
				await readFile(path.join(bardoRoot, "events/state-changes.ndjson"), "utf8")
			)
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(eventLog).toHaveLength(1);
			expect(eventLog[0]).toMatchObject({
				eventType: "bootstrap",
				actorType: "system-bootstrap",
				type: "bootstrap_initialized",
			});

			const diagnostics = JSON.parse(
				await readFile(path.join(bardoRoot, "manifests/diagnostics.json"), "utf8"),
			) as {
				latestEventId?: string | null;
				latestSnapshotPath?: string;
				recentEventIds?: string[];
				snapshotCount?: number;
				integrity?: { status?: string };
			};
			expect(diagnostics).toMatchObject({
				latestSnapshotPath: "snapshots/000000-bootstrap.json",
				snapshotCount: 1,
				integrity: { status: "valid" },
			});
			expect(diagnostics.latestEventId).toBeTruthy();
			expect(diagnostics.recentEventIds).toEqual([diagnostics.latestEventId]);

			const replayed = await replayCommittedState({
				bardoRoot,
				mode: "events-only",
				dryRun: true,
			});
			expect(replayed.currentState).toEqual(currentState);
			expect(replayed.stateHash).toBe(computeStateHash(currentState));
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("skips oversized campaign inputs without corrupting readiness or state", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-campaign-bootstrap-"),
		);
		const bardoRoot = resolveBardoRoot(workspaceRoot);

		try {
			await mkdir(path.join(bardoRoot, "rules/normalized"), {
				recursive: true,
			});
			await writeFile(
				path.join(bardoRoot, "rules/normalized/index.json"),
				JSON.stringify({
					recommendedSimulationDepth: "standard",
					sections: [{ title: "Travel", tags: ["travel"] }],
				}),
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, "campaign-notes.md"),
				[
					"# Campaign Notes",
					"",
					"Current location: River Market",
					"Quest: Find the ferryman",
				].join("\n"),
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, "oversized-notes.md"),
				`# Oversized\n\n${"lore ".repeat(140_000)}`,
				"utf8",
			);

			const result = await bootstrapCampaignWorkspace({
				workspaceRoot,
				bardoRoot,
				nowIso: "2026-04-09T00:00:00.000Z",
			});

			expect(result.readiness.status).toBe("ready-with-gaps");

			const currentState = JSON.parse(
				await readFile(path.join(bardoRoot, result.currentStatePath), "utf8"),
			) as { currentLocation: string | null; activeQuests: string[] };
			expect(currentState.currentLocation).toBe("River Market");
			expect(currentState.activeQuests).toEqual(["Find the ferryman"]);

			const readiness = JSON.parse(
				await readFile(path.join(bardoRoot, result.readinessPath), "utf8"),
			) as { status: CampaignBootstrapReadiness; gaps: string[] };
			expect(readiness.gaps).toEqual(
				expect.arrayContaining([
					expect.stringContaining(
						"Skipped oversized source oversized-notes.md",
					),
				]),
			);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("ignores common tooling directories and does not turn oversized rulebooks into campaign gaps", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-campaign-bootstrap-"),
		);
		const bardoRoot = resolveBardoRoot(workspaceRoot);

		try {
			await mkdir(path.join(bardoRoot, "rules/normalized"), {
				recursive: true,
			});
			await mkdir(path.join(workspaceRoot, "workspaces"), { recursive: true });
			await mkdir(path.join(workspaceRoot, "bin"), { recursive: true });
			await writeFile(
				path.join(bardoRoot, "rules/normalized/index.json"),
				JSON.stringify({
					recommendedSimulationDepth: "deep",
					sections: [{ title: "Travel", tags: ["travel"] }],
				}),
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, "rulebook.md"),
				`# Huge Rulebook\n\n${"rules ".repeat(140_000)}`,
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, "campaign-notes.md"),
				[
					"# Campaign Notes",
					"",
					"Current location: River Market",
					"Quest: Find the ferryman",
				].join("\n"),
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, "workspaces", "contaminant.md"),
				"Current location: Wrong Place",
				"utf8",
			);
			await writeFile(
				path.join(workspaceRoot, "bin", "contaminant.json"),
				JSON.stringify({ quest: "Wrong quest" }),
				"utf8",
			);

			const result = await bootstrapCampaignWorkspace({
				workspaceRoot,
				bardoRoot,
				nowIso: "2026-04-09T00:00:00.000Z",
			});

			expect(result.readiness.status).toBe("ready");

			const sourceIndex = JSON.parse(
				await readFile(path.join(bardoRoot, result.sourceIndexPath), "utf8"),
			) as {
				sources: Array<{ relativePath: string; role: string; status: string }>;
			};
			expect(
				sourceIndex.sources.some(
					(source) => source.relativePath === "workspaces/contaminant.md",
				),
			).toBe(false);
			expect(
				sourceIndex.sources.some(
					(source) => source.relativePath === "bin/contaminant.json",
				),
			).toBe(false);

			const readiness = JSON.parse(
				await readFile(path.join(bardoRoot, result.readinessPath), "utf8"),
			) as { status: CampaignBootstrapReadiness; gaps: string[] };
			expect(readiness.status).toBe("ready");
			expect(readiness.gaps.some((gap) => gap.includes("rulebook.md"))).toBe(
				false,
			);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});
});
