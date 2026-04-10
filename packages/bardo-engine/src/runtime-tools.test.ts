import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	commitStateChangingEvent,
	createRuntimeToolHandlers,
} from "./runtime-tools";
import { resolveBardoRoot } from "./workspace";

function requireRuntimeHandler(
	handlers: ReturnType<typeof createRuntimeToolHandlers>,
	name: string,
) {
	const handler = handlers[name];
	if (typeof handler !== "function") {
		throw new Error(`Missing runtime tool handler: ${name}`);
	}
	return handler;
}

async function seedRuntimeArtifacts(
	workspaceRoot: string,
): Promise<{ bardoRoot: string }> {
	const bardoRoot = resolveBardoRoot(workspaceRoot);
	await mkdir(path.join(bardoRoot, "events"), { recursive: true });
	await mkdir(path.join(bardoRoot, "state"), { recursive: true });
	await mkdir(path.join(bardoRoot, "entities"), { recursive: true });
	await mkdir(path.join(bardoRoot, "manifests"), { recursive: true });
	await mkdir(path.join(bardoRoot, "rules", "normalized"), {
		recursive: true,
	});
	await writeFile(
		path.join(bardoRoot, "state/current-state.json"),
		JSON.stringify({
			currentLocation: "River Market",
			activeQuests: ["Find the ferryman"],
			relevantFactions: ["Guild of Keys"],
			recentEvents: [],
			uncertainties: [],
			factsRevealed: [],
			resourcesSpent: [],
			damageTaken: [],
			factionConsequences: [],
			npcAttitudes: {},
			clockProgress: [],
			activeCorrections: [],
		}),
		"utf8",
	);
	await writeFile(
		path.join(bardoRoot, "entities/campaign-entities.json"),
		JSON.stringify({
			characters: ["Mira"],
			locations: ["River Market", "Ash Court"],
			quests: ["Find the ferryman"],
			factions: ["Guild of Keys"],
			recentEvents: [],
			facts: [],
			clocks: ["Eclipse Clock"],
		}),
		"utf8",
	);
	await writeFile(
		path.join(bardoRoot, "manifests/readiness.json"),
		JSON.stringify({
			status: "ready-with-gaps",
			gaps: [],
		}),
		"utf8",
	);
	await writeFile(
		path.join(bardoRoot, "rules/normalized/index.json"),
		JSON.stringify({
			recommendedSimulationDepth: "standard",
			sections: [],
		}),
		"utf8",
	);
	await writeFile(
		path.join(bardoRoot, "events/state-changes.ndjson"),
		"",
		"utf8",
	);
	return { bardoRoot };
}

describe("runtime tools", () => {
	test("rejects direct commits that are not explicitly validated", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-runtime-"),
		);
		const { bardoRoot } = await seedRuntimeArtifacts(workspaceRoot);

		try {
			await expect(
				commitStateChangingEvent({
					bardoRoot,
					event: {
						type: "quest_advanced",
						summary: "The ferryman quest advanced.",
						changes: {
							activeQuests: ["Find the ferryman"],
						},
					},
					nowIso: "2026-04-09T01:00:00.000Z",
				}),
			).rejects.toThrow("validated");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("world_sync commits only grounded changes from campaign artifacts", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-runtime-"),
		);
		const { bardoRoot } = await seedRuntimeArtifacts(workspaceRoot);

		try {
			const handlers = createRuntimeToolHandlers();
			const result = await requireRuntimeHandler(handlers, "world_sync")(
				{ currentLocation: "Ash Court" },
				{
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-04-09T02:00:00.000Z",
				},
			);

			expect(result).toMatchObject({
				success: true,
				committed: true,
				canonChanged: true,
				confidence: "grounded",
				eventType: "world_sync_applied",
			});

			const currentState = JSON.parse(
				await readFile(
					path.join(bardoRoot, "state/current-state.json"),
					"utf8",
				),
			) as { currentLocation: string };
			expect(currentState.currentLocation).toBe("Ash Court");

			const eventLog = await readFile(
				path.join(bardoRoot, "events/state-changes.ndjson"),
				"utf8",
			);
			expect(eventLog).toContain('"validated":true');
			expect(eventLog).toContain(
				'"canonBasis":"approved-resolved-consequence"',
			);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("world_sync rejects ungrounded locations instead of mutating canon", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-runtime-"),
		);
		const { bardoRoot } = await seedRuntimeArtifacts(workspaceRoot);

		try {
			const handlers = createRuntimeToolHandlers();
			const result = await requireRuntimeHandler(handlers, "world_sync")(
				{ currentLocation: "Moonlit Vault" },
				{
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-04-09T03:00:00.000Z",
				},
			);

			expect(result).toMatchObject({
				success: true,
				committed: false,
			});
			expect(result.uncertainties).toEqual(
				expect.arrayContaining([expect.stringContaining("Moonlit Vault")]),
			);

			const currentState = JSON.parse(
				await readFile(
					path.join(bardoRoot, "state/current-state.json"),
					"utf8",
				),
			) as { currentLocation: string };
			expect(currentState.currentLocation).toBe("River Market");

			const eventLog = await readFile(
				path.join(bardoRoot, "events/state-changes.ndjson"),
				"utf8",
			);
			expect(eventLog.trim()).toBe("");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("player_action does not auto-commit canon from narration alone", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-runtime-"),
		);
		const { bardoRoot } = await seedRuntimeArtifacts(workspaceRoot);

		try {
			const handlers = createRuntimeToolHandlers();
			const result = await requireRuntimeHandler(handlers, "player_action")(
				{ action: "I search the crypt for hidden doors." },
				{
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-04-09T04:00:00.000Z",
				},
			);

			expect(result).toMatchObject({
				success: true,
				committed: false,
				canonChanged: false,
				confidence: "conservative",
			});
			expect(result.uncertainties).toEqual(
				expect.arrayContaining([expect.stringContaining("validated")]),
			);

			const currentState = JSON.parse(
				await readFile(
					path.join(bardoRoot, "state/current-state.json"),
					"utf8",
				),
			) as { recentEvents: string[] };
			expect(currentState.recentEvents).toEqual([]);

			const eventLog = await readFile(
				path.join(bardoRoot, "events/state-changes.ndjson"),
				"utf8",
			);
			expect(eventLog.trim()).toBe("");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("scene_turn surfaces the most relevant grounded rules for the current intent", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-runtime-"),
		);
		const { bardoRoot } = await seedRuntimeArtifacts(workspaceRoot);

		try {
			await writeFile(
				path.join(bardoRoot, "rules/normalized/index.json"),
				JSON.stringify({
					recommendedSimulationDepth: "deep",
					sections: [
						{
							title: "Combat Procedure",
							filename: "01-combat-procedure.md",
							summary:
								"Resolve ambushes, initiative, attacks, and defensive reactions during combat scenes.",
							tags: ["combat", "initiative", "attack"],
							keywords: ["combat", "initiative", "attack", "ambush"],
						},
						{
							title: "Faction Turns",
							filename: "02-faction-turns.md",
							summary:
								"Advance faction plans and political pressure when time passes between scenes.",
							tags: ["faction", "reputation", "world"],
							keywords: ["faction", "politics", "pressure"],
						},
					],
				}),
				"utf8",
			);

			const handlers = createRuntimeToolHandlers();
			const result = await requireRuntimeHandler(handlers, "scene_turn")(
				{
					playerIntent:
						"We expect an ambush, so I need combat guidance for initiative and attacks.",
				},
				{
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-04-09T04:30:00.000Z",
				},
			);

			expect(result.relevantRules).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						title: "Combat Procedure",
						filename: "01-combat-procedure.md",
					}),
				]),
			);
			expect(result.gmGuidance).toEqual(
				expect.arrayContaining([expect.stringContaining("Combat Procedure")]),
			);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("scene_turn ignores stop-word noise when ranking relevant rules", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-runtime-"),
		);
		const { bardoRoot } = await seedRuntimeArtifacts(workspaceRoot);

		try {
			await writeFile(
				path.join(bardoRoot, "rules/normalized/index.json"),
				JSON.stringify({
					recommendedSimulationDepth: "standard",
					sections: [
						{
							title: "DOORS",
							filename: "01-doors.md",
							summary:
								"Adjudicate secret doors, locks, and searching room features during exploration.",
							tags: ["core-resolution", "location"],
							keywords: ["doors", "secret", "search", "lock"],
						},
						{
							title: "RESPECT FOR THE PLAYERS",
							filename: "02-respect-for-the-players.md",
							summary:
								"Players need to know that you will run a fair game and listen carefully to their choices.",
							tags: ["core-concepts"],
							keywords: ["players", "respect", "fair", "choices"],
						},
					],
				}),
				"utf8",
			);

			const handlers = createRuntimeToolHandlers();
			const result = await requireRuntimeHandler(handlers, "scene_turn")(
				{
					playerIntent:
						"I need guidance for searching hidden doors in a dangerous dungeon.",
				},
				{
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-04-09T04:35:00.000Z",
				},
			);

			expect(result.relevantRules?.[0]).toMatchObject({
				title: "DOORS",
			});
			expect(result.relevantRules).not.toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						title: "RESPECT FOR THE PLAYERS",
					}),
				]),
			);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("scene_turn prefers no close rule match over a broad tag-only match", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-runtime-"),
		);
		const { bardoRoot } = await seedRuntimeArtifacts(workspaceRoot);

		try {
			await writeFile(
				path.join(bardoRoot, "rules/normalized/index.json"),
				JSON.stringify({
					recommendedSimulationDepth: "standard",
					sections: [
						{
							title: "CITY NEIGHBORHOODS",
							filename: "01-city-neighborhoods.md",
							summary:
								"A broad setting overview of trade districts and city landmarks.",
							tags: ["faction", "world", "location"],
							keywords: ["city", "district", "market"],
						},
					],
				}),
				"utf8",
			);

			const handlers = createRuntimeToolHandlers();
			const result = await requireRuntimeHandler(handlers, "scene_turn")(
				{
					playerIntent:
						"Advance the scene with faction pressure from the Guild of Keys.",
				},
				{
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-04-09T04:40:00.000Z",
				},
			);

			expect(result.relevantRules).toEqual([]);
			expect(result.gmGuidance).toEqual(
				expect.arrayContaining([
					expect.stringContaining("No closely matched normalized rule section"),
				]),
			);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("player_action returns rule guidance when canon cannot advance yet", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-runtime-"),
		);
		const { bardoRoot } = await seedRuntimeArtifacts(workspaceRoot);

		try {
			await writeFile(
				path.join(bardoRoot, "rules/normalized/index.json"),
				JSON.stringify({
					recommendedSimulationDepth: "standard",
					sections: [
						{
							title: "Search and Discovery",
							filename: "01-search-and-discovery.md",
							summary:
								"Use this procedure when players inspect rooms, search for clues, or probe for hidden doors.",
							tags: ["core-resolution", "location"],
							keywords: ["search", "clues", "hidden", "doors"],
						},
					],
				}),
				"utf8",
			);

			const handlers = createRuntimeToolHandlers();
			const result = await requireRuntimeHandler(handlers, "player_action")(
				{ action: "I search the crypt for hidden doors." },
				{
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-04-09T04:45:00.000Z",
				},
			);

			expect(result.committed).toBe(false);
			expect(result.relevantRules).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						title: "Search and Discovery",
					}),
				]),
			);
			expect(result.gmGuidance).toEqual(
				expect.arrayContaining([
					expect.stringContaining("Search and Discovery"),
				]),
			);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("blocked canon changes tell agents not to narrate unsupported proposals as fact", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-runtime-"),
		);
		const { bardoRoot } = await seedRuntimeArtifacts(workspaceRoot);

		try {
			const handlers = createRuntimeToolHandlers();
			const result = await requireRuntimeHandler(handlers, "player_action")(
				{
					action:
						"Dock Wardens reveal that the ferryman now waits at East Wharf.",
					recentEvents: [
						"Dock Wardens reveal the ferryman now waits at East Wharf.",
					],
					factsRevealed: ["Ferryman location: East Wharf."],
				},
				{
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-04-09T04:50:00.000Z",
				},
			);

			expect(result).toMatchObject({
				success: true,
				committed: false,
				confidence: "blocked",
			});
			expect(result.agentInstructions).toEqual(
				expect.arrayContaining([
					expect.stringContaining(
						"Do not narrate blocked proposals as established fact",
					),
				]),
			);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("world_sync validates quest, faction, and event updates against campaign artifacts", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-runtime-"),
		);
		const { bardoRoot } = await seedRuntimeArtifacts(workspaceRoot);

		try {
			await writeFile(
				path.join(bardoRoot, "entities/campaign-entities.json"),
				JSON.stringify({
					characters: ["Mira"],
					locations: ["River Market", "Ash Court"],
					quests: ["Find the ferryman", "Warn the Dock Wardens"],
					factions: ["Guild of Keys", "Dock Wardens"],
					recentEvents: ["The bridge collapsed yesterday."],
					facts: [],
					clocks: ["Eclipse Clock"],
				}),
				"utf8",
			);
			const handlers = createRuntimeToolHandlers();
			const result = await requireRuntimeHandler(handlers, "world_sync")(
				{
					currentLocation: "Ash Court",
					activeQuests: ["Warn the Dock Wardens"],
					relevantFactions: ["Dock Wardens"],
					recentEvents: ["The bridge collapsed yesterday."],
				},
				{
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-04-09T05:00:00.000Z",
				},
			);

			expect(result).toMatchObject({
				success: true,
				committed: true,
			});

			const currentState = JSON.parse(
				await readFile(
					path.join(bardoRoot, "state/current-state.json"),
					"utf8",
				),
			) as {
				currentLocation: string;
				activeQuests: string[];
				relevantFactions: string[];
				recentEvents: string[];
			};
			expect(currentState.currentLocation).toBe("Ash Court");
			expect(currentState.activeQuests).toEqual(["Warn the Dock Wardens"]);
			expect(currentState.relevantFactions).toEqual(["Dock Wardens"]);
			expect(currentState.recentEvents).toEqual(
				expect.arrayContaining(["The bridge collapsed yesterday."]),
			);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("world_sync fails closed on contradictory grounded proposals", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-runtime-"),
		);
		const { bardoRoot } = await seedRuntimeArtifacts(workspaceRoot);

		try {
			await writeFile(
				path.join(bardoRoot, "entities/campaign-entities.json"),
				JSON.stringify({
					characters: ["Mira"],
					locations: ["River Market", "Ash Court"],
					quests: ["Find the ferryman"],
					factions: ["Guild of Keys", "Dock Wardens"],
					recentEvents: ["The bridge collapsed yesterday."],
					facts: [],
					clocks: ["Eclipse Clock"],
				}),
				"utf8",
			);
			const handlers = createRuntimeToolHandlers();
			const result = await requireRuntimeHandler(handlers, "world_sync")(
				{
					currentLocation: "Ash Court",
					activeQuests: ["Unknown Quest"],
					relevantFactions: ["Dock Wardens"],
				},
				{
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-04-09T06:00:00.000Z",
				},
			);

			expect(result).toMatchObject({
				success: true,
				committed: false,
			});
			expect(result.conflicts).toEqual(
				expect.arrayContaining([expect.stringContaining("Unknown Quest")]),
			);

			const currentState = JSON.parse(
				await readFile(
					path.join(bardoRoot, "state/current-state.json"),
					"utf8",
				),
			) as { currentLocation: string; activeQuests: string[] };
			expect(currentState.currentLocation).toBe("River Market");
			expect(currentState.activeQuests).toEqual(["Find the ferryman"]);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("scene_turn fails closed on corrupted runtime artifacts", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-runtime-"),
		);
		const { bardoRoot } = await seedRuntimeArtifacts(workspaceRoot);

		try {
			await writeFile(
				path.join(bardoRoot, "manifests/readiness.json"),
				"{ not-json",
				"utf8",
			);
			const handlers = createRuntimeToolHandlers();
			await expect(
				requireRuntimeHandler(handlers, "scene_turn")(
					{},
					{
						workspaceRoot,
						bardoRoot,
						nowIso: "2026-04-09T07:00:00.000Z",
					},
				),
			).rejects.toThrow("Runtime artifact corruption detected");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("preserved tool names are available from the local-first runtime", () => {
		const handlers = createRuntimeToolHandlers();
		expect(Object.keys(handlers)).toEqual(
			expect.arrayContaining([
				"init",
				"scene_turn",
				"player_action",
				"user_correction",
				"world_sync",
				"simulation_tick",
			]),
		);
	});

	test("user_correction commits explicit corrections at the highest precedence and blocks later conflicting syncs", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-runtime-"),
		);
		const { bardoRoot } = await seedRuntimeArtifacts(workspaceRoot);

		try {
			const handlers = createRuntimeToolHandlers();
			const correction = await requireRuntimeHandler(
				handlers,
				"user_correction",
			)(
				{
					correction:
						"The party is already at Ash Court; River Market was outdated session narration.",
					currentLocation: "Ash Court",
					factsRevealed: ["Mira confirms the ferryman moved to Ash Court."],
				},
				{
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-04-09T08:00:00.000Z",
				},
			);

			expect(correction).toMatchObject({
				success: true,
				committed: true,
				canonChanged: true,
				confidence: "corrected",
			});
			expect(correction.canonPrecedence).toEqual([
				"explicit user correction",
				"preserved source rules text",
				"current campaign source files",
				"approved committed state",
				"recent validated play result",
				"inference",
				"narration flavor",
			]);

			const correctedState = JSON.parse(
				await readFile(
					path.join(bardoRoot, "state/current-state.json"),
					"utf8",
				),
			) as {
				currentLocation: string;
				activeCorrections: string[];
				factsRevealed: string[];
			};
			expect(correctedState.currentLocation).toBe("Ash Court");
			expect(correctedState.activeCorrections).toEqual(
				expect.arrayContaining([expect.stringContaining("Ash Court")]),
			);
			expect(correctedState.factsRevealed).toEqual(
				expect.arrayContaining([
					"Mira confirms the ferryman moved to Ash Court.",
				]),
			);

			const conflictingSync = await requireRuntimeHandler(
				handlers,
				"world_sync",
			)(
				{ currentLocation: "River Market" },
				{
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-04-09T08:30:00.000Z",
				},
			);

			expect(conflictingSync).toMatchObject({
				success: true,
				committed: false,
				canonChanged: false,
				confidence: "blocked",
			});
			expect(conflictingSync.conflicts).toEqual(
				expect.arrayContaining([
					expect.stringContaining("explicit user correction"),
				]),
			);

			const eventLog = await readFile(
				path.join(bardoRoot, "events/state-changes.ndjson"),
				"utf8",
			);
			expect(eventLog).toContain('"canonBasis":"explicit-user-correction"');
			expect(eventLog).toContain('"eventType":"user_correction"');
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("user_correction durably records a plain-language correction even without structured field overrides", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-runtime-"),
		);
		const { bardoRoot } = await seedRuntimeArtifacts(workspaceRoot);

		try {
			const handlers = createRuntimeToolHandlers();
			const correction = await requireRuntimeHandler(
				handlers,
				"user_correction",
			)(
				{
					correction: "The ferryman is Maro, not Tavin.",
				},
				{
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-04-09T08:45:00.000Z",
				},
			);

			expect(correction).toMatchObject({
				success: true,
				committed: true,
				canonChanged: true,
				confidence: "corrected",
				eventType: "user_correction",
			});

			const correctedState = JSON.parse(
				await readFile(
					path.join(bardoRoot, "state/current-state.json"),
					"utf8",
				),
			) as {
				activeCorrections: string[];
				currentLocation: string;
			};
			expect(correctedState.currentLocation).toBe("River Market");
			expect(correctedState.activeCorrections).toEqual(
				expect.arrayContaining(["The ferryman is Maro, not Tavin."]),
			);

			const eventLog = await readFile(
				path.join(bardoRoot, "events/state-changes.ndjson"),
				"utf8",
			);
			expect(eventLog).toContain('"canonBasis":"explicit-user-correction"');
			expect(eventLog).toContain("The ferryman is Maro, not Tavin.");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("simulation_tick commits validated world consequences for factions, NPC continuity, and clocks", async () => {
		const workspaceRoot = await mkdtemp(
			path.join(os.tmpdir(), "bardo-runtime-"),
		);
		const { bardoRoot } = await seedRuntimeArtifacts(workspaceRoot);

		try {
			await writeFile(
				path.join(bardoRoot, "entities/campaign-entities.json"),
				JSON.stringify({
					characters: ["Mira"],
					locations: ["River Market", "Ash Court"],
					quests: ["Find the ferryman"],
					factions: ["Guild of Keys"],
					recentEvents: ["The bridge collapsed yesterday."],
					facts: ["The ferryman answers to the Guild of Keys."],
					clocks: ["Eclipse Clock"],
				}),
				"utf8",
			);

			const handlers = createRuntimeToolHandlers();
			const result = await requireRuntimeHandler(handlers, "simulation_tick")(
				{
					tickLabel: "Off-screen faction progress",
					factionConsequences: [
						"Guild of Keys tightened patrols in Ash Court.",
					],
					npcAttitudes: { Mira: "wary" },
					clockProgress: ["Eclipse Clock advanced to 2/6."],
					factsRevealed: ["The ferryman answers to the Guild of Keys."],
					resourcesSpent: ["1 torch"],
					damageTaken: ["Mira bruised shoulder"],
				},
				{
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-04-09T09:00:00.000Z",
				},
			);

			expect(result).toMatchObject({
				success: true,
				committed: true,
				canonChanged: true,
				confidence: "grounded",
				eventType: "simulation_tick_applied",
			});

			const currentState = JSON.parse(
				await readFile(
					path.join(bardoRoot, "state/current-state.json"),
					"utf8",
				),
			) as {
				factionConsequences: string[];
				clockProgress: string[];
				factsRevealed: string[];
				resourcesSpent: string[];
				damageTaken: string[];
				npcAttitudes: Record<string, string>;
			};
			expect(currentState.factionConsequences).toEqual(
				expect.arrayContaining([
					"Guild of Keys tightened patrols in Ash Court.",
				]),
			);
			expect(currentState.clockProgress).toEqual(
				expect.arrayContaining(["Eclipse Clock advanced to 2/6."]),
			);
			expect(currentState.factsRevealed).toEqual(
				expect.arrayContaining(["The ferryman answers to the Guild of Keys."]),
			);
			expect(currentState.resourcesSpent).toEqual(
				expect.arrayContaining(["1 torch"]),
			);
			expect(currentState.damageTaken).toEqual(
				expect.arrayContaining(["Mira bruised shoulder"]),
			);
			expect(currentState.npcAttitudes).toMatchObject({
				Mira: "wary",
			});
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});
});
