import { describe, expect, test } from "bun:test";
import {
	createStableEntityId,
	findPotentialDuplicateEntities,
	mergeEntityRecords,
	migrateCurrentStateArtifact,
	normalizeEntityCatalogAliases,
	replaceEntityReferenceNames,
	splitEntityRecord,
	upsertEntityRecord,
} from "./runtime-contracts";

describe("runtime contracts", () => {
	test("migrates a legacy versionless current state into schema v2 defaults", () => {
		const migrated = migrateCurrentStateArtifact({
			raw: {
				currentLocation: "Ash Court",
				activeQuests: ["Find the ferryman"],
			},
			nowIso: "2026-05-01T00:00:00.000Z",
		});
		expect(migrated.schemaVersion).toBe(2);
		expect(migrated.currentLocation).toBe("Ash Court");
		expect(Array.isArray(migrated.consequenceRecords)).toBe(true);
		expect(migrated.revealStates).toEqual({});
	});

	test("detects duplicate candidates and merges entity aliases", () => {
		const catalog = normalizeEntityCatalogAliases({
			characters: [
				{
					id: createStableEntityId("character", "Mira"),
					name: "Mira",
					aliases: ["Mira"],
					sourcePaths: [],
				},
				{
					id: createStableEntityId("character", "Mira of Ash"),
					name: "Mira of Ash",
					aliases: ["Mira"],
					sourcePaths: [],
				},
			],
			locations: [],
			quests: [],
			factions: [],
			recentEvents: [],
			facts: [],
			clocks: [],
		});
		expect(findPotentialDuplicateEntities(catalog)).toHaveLength(1);

		const merged = mergeEntityRecords({
			catalog,
			kind: "characters",
			primaryName: "Mira",
			duplicateName: "Mira of Ash",
		});
		expect(merged.characters).toHaveLength(1);
		expect(merged.characters[0]?.aliases).toEqual(
			expect.arrayContaining(["Mira", "Mira of Ash"]),
		);
	});

	test("splits entity aliases and rewrites current-state references", () => {
		const catalog = {
			characters: [
				{
					id: createStableEntityId("character", "Mira"),
					name: "Mira",
					aliases: ["Mira", "Captain Mira"],
					sourcePaths: [],
				},
			],
			locations: [],
			quests: [],
			factions: [],
			recentEvents: [],
			facts: [],
			clocks: [],
		};
		const split = splitEntityRecord({
			catalog,
			kind: "characters",
			existingName: "Mira",
			newName: "Captain Mira",
			newAliases: ["Captain Mira"],
		});
		expect(split.characters).toHaveLength(2);

		const currentState = migrateCurrentStateArtifact({
			raw: {
				npcAttitudes: { "Captain Mira": "wary" },
			},
			nowIso: "2026-05-01T00:00:00.000Z",
		});
		const replaced = replaceEntityReferenceNames({
			currentState,
			fromName: "Captain Mira",
			toName: "Mira",
		});
		expect(replaced.npcAttitudes).toMatchObject({ Mira: "wary" });
	});

	test("upserts explicit-correction entities without creating duplicates", () => {
		const catalog = normalizeEntityCatalogAliases({
			characters: [],
			locations: [
				{
					id: createStableEntityId("location", "River Market"),
					name: "River Market",
					aliases: ["River Market"],
					sourcePaths: [],
				},
			],
			quests: [],
			factions: [],
			recentEvents: [],
			facts: [],
			clocks: [],
		});

		const withNewLocation = upsertEntityRecord({
			catalog,
			kind: "locations",
			name: "Ash Court",
			sourcePath: "user_correction",
		});
		expect(withNewLocation.locations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: createStableEntityId("location", "Ash Court"),
					name: "Ash Court",
					aliases: expect.arrayContaining(["Ash Court"]),
					sourcePaths: expect.arrayContaining(["user_correction"]),
				}),
			]),
		);

		const withoutDuplicate = upsertEntityRecord({
			catalog: withNewLocation,
			kind: "locations",
			name: "Ash Court",
			sourcePath: "user_correction",
		});
		expect(
			withoutDuplicate.locations.filter(
				(entry) => entry.name === "Ash Court",
			),
		).toHaveLength(1);
	});
});
