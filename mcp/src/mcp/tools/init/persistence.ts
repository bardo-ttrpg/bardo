import { writeFile } from "node:fs/promises";
import type { CampaignState } from "../../../domain/campaign/types";
import { resolveFeatureFlags } from "../../../domain/config/features";
import {
	parseMarkdown,
	renderMarkdown,
} from "../../../domain/markdown/markdown";
import {
	ensureParentDirectoryExists,
	readTextIfExists,
} from "../../../infra/filesystem/filesystem";
import { recordLegacyCompatibilityWriteMetric } from "../../../telemetry";
import type { InitOutput } from "./schemas";
import {
	normalizePendingInitInputs,
	type PendingInitInputs,
	readJsonMarkdown,
} from "./settings";
import { inferLocationSlug, toDisplayName } from "./spawn";
import type { SpawnSelection } from "./types";

export async function resolveSceneSpawnFromState(
	statePath: string,
	fallbackLocationName: string,
	fallbackLocationSlug: string,
): Promise<{
	locationName: string;
	locationSlug: string;
	spawn: SpawnSelection;
}> {
	const currentState = await readJsonMarkdown(statePath);
	const stateData = currentState.data;
	let locationName = fallbackLocationName;
	let locationSlug = fallbackLocationSlug;

	if (typeof stateData.currentLocation === "string") {
		locationSlug = inferLocationSlug(stateData.currentLocation);
		const stateLocations =
			typeof stateData.locations === "object" && stateData.locations !== null
				? (stateData.locations as Record<string, unknown>)
				: {};
		const maybeLocation = stateLocations[locationSlug];
		if (typeof maybeLocation === "object" && maybeLocation !== null) {
			const locationRecord = maybeLocation as Record<string, unknown>;
			locationName =
				typeof locationRecord.name === "string" && locationRecord.name.trim()
					? locationRecord.name.trim()
					: toDisplayName(locationSlug);
		} else {
			locationName = toDisplayName(locationSlug);
		}
	}

	return {
		locationName,
		locationSlug,
		spawn: {
			slug: locationSlug,
			name: locationName,
			origin: "existing_state",
		},
	};
}

export async function persistInitSettings(args: {
	settingsPath: string;
	nowIso: string;
	resolvedDiceRoller: "player" | "bardo" | null;
	resolvedTheme: string | null;
	resolvedOptionalSystems: {
		npcs: boolean;
		quests: boolean;
		items: boolean;
		worldGeneration: boolean;
	};
	spawnSelection: SpawnSelection | null;
	bootstrap: {
		complete: boolean;
		alreadyInitialized: boolean;
	};
}): Promise<void> {
	const nextSettings = {
		diceRoller: args.resolvedDiceRoller,
		theme: args.resolvedTheme,
		optionalSystems: args.resolvedOptionalSystems,
		startingScenePath: "world/scenes/starting-scene.md",
		mapPath: "world/maps/primary-map.md",
		pendingInitInputs: null,
		lastSpawn: args.spawnSelection
			? {
					slug: args.spawnSelection.slug,
					name: args.spawnSelection.name,
					origin: args.spawnSelection.origin,
				}
			: null,
		bootstrap: {
			complete: args.bootstrap.complete,
			alreadyInitialized: args.bootstrap.alreadyInitialized,
			updatedAtISO: args.nowIso,
		},
		updatedAtISO: args.nowIso,
	};

	await ensureParentDirectoryExists(args.settingsPath);
	await writeFile(
		args.settingsPath,
		renderMarkdown(
			{
				description:
					"Campaign setup settings and preferences (authoritative location)",
				title: "Campaign Settings",
			},
			JSON.stringify(nextSettings, null, 2),
		),
		"utf8",
	);
}

export async function persistPendingInitInputs(args: {
	settingsPath: string;
	nowIso: string;
	diceRoller: "player" | "bardo" | null;
	theme: string | null;
	startingScene: string | null;
}): Promise<void> {
	const existing = await readJsonMarkdown(args.settingsPath);
	const existingPending = normalizePendingInitInputs(
		existing.data.pendingInitInputs,
	);
	const nextPending: PendingInitInputs = {
		diceRoller: args.diceRoller ?? existingPending.diceRoller,
		theme: args.theme ?? existingPending.theme,
		startingScene: args.startingScene ?? existingPending.startingScene,
	};

	const nextSettings = {
		...existing.data,
		pendingInitInputs: nextPending,
		updatedAtISO: args.nowIso,
	};

	await ensureParentDirectoryExists(args.settingsPath);
	await writeFile(
		args.settingsPath,
		renderMarkdown(
			{
				description:
					existing.frontmatter.description ??
					"Campaign setup settings and preferences (authoritative location)",
				title: existing.frontmatter.title ?? "Campaign Settings",
			},
			JSON.stringify(nextSettings, null, 2),
		),
		"utf8",
	);
}

export async function persistStateAndHistory(args: {
	statePath: string;
	historyPath: string;
	nowIso: string;
	startingLocationSlug: string;
	startingLocationName: string;
	resolvedDiceRoller: "player" | "bardo" | null;
	resolvedTheme: string | null;
	startingSceneSource: InitOutput["startingSceneSource"];
}): Promise<CampaignState> {
	const strictCanonicalMode = resolveFeatureFlags(Bun.env).strictCanonicalMode;
	const currentState = await readJsonMarkdown(args.statePath);
	const stateData = currentState.data;

	const counters =
		typeof stateData.counters === "object" && stateData.counters !== null
			? (stateData.counters as Record<string, unknown>)
			: {};
	const locations =
		typeof stateData.locations === "object" && stateData.locations !== null
			? (stateData.locations as CampaignState["locations"])
			: ({} as CampaignState["locations"]);

	if (!(args.startingLocationSlug in locations)) {
		locations[args.startingLocationSlug] = {
			name: args.startingLocationName,
			visits: 0,
			npcIds: [],
			tags: [],
			exits: [],
			activeClues: [],
			occupantIds: [],
		};
	}

	const nextState = {
		worldTimeISO:
			typeof stateData.worldTimeISO === "string"
				? stateData.worldTimeISO
				: args.nowIso,
		currentLocation:
			typeof stateData.currentLocation === "string"
				? stateData.currentLocation
				: args.startingLocationSlug,
		counters: {
			unknownNpc:
				typeof counters.unknownNpc === "number" ? counters.unknownNpc : 0,
			unknownLocation:
				typeof counters.unknownLocation === "number"
					? counters.unknownLocation
					: 0,
		},
		scene: {
			summary: `The campaign opens at ${args.startingLocationName}.`,
			activeSituation: "Take the first meaningful action of the campaign.",
			exits: [],
			sensoryCues: [],
			unresolvedQuestions: [],
		},
		party: {
			currentLocation: args.startingLocationSlug,
			statusSummary: `The party begins at ${args.startingLocationName}.`,
			knownResources: [],
			activeConditions: [],
		},
		npcs:
			typeof stateData.npcs === "object" && stateData.npcs !== null
				? (stateData.npcs as CampaignState["npcs"])
				: ({} as CampaignState["npcs"]),
		locations,
		threads:
			typeof stateData.threads === "object" && stateData.threads !== null
				? (stateData.threads as CampaignState["threads"])
				: ({} as CampaignState["threads"]),
		factions:
			typeof stateData.factions === "object" && stateData.factions !== null
				? (stateData.factions as CampaignState["factions"])
				: ({} as CampaignState["factions"]),
		clocks:
			typeof stateData.clocks === "object" && stateData.clocks !== null
				? (stateData.clocks as CampaignState["clocks"])
				: ({} as CampaignState["clocks"]),
		mechanicsContext:
			typeof stateData.mechanicsContext === "object" &&
			stateData.mechanicsContext !== null
				? (stateData.mechanicsContext as CampaignState["mechanicsContext"])
				: {
						ruleset: "d20_v1",
						difficultyHint: null,
						combatActive: false,
						initiativeOrder: [],
						advantageHints: [],
					},
		lastAction: "campaign_initialized",
	} satisfies CampaignState;

	await ensureParentDirectoryExists(args.statePath);
	await writeFile(
		args.statePath,
		renderMarkdown(
			{
				description: "Current campaign state and memory snapshot",
				title: "Campaign State",
			},
			JSON.stringify(nextState, null, 2),
		),
		"utf8",
	);
	recordLegacyCompatibilityWriteMetric({
		consumer: "init",
		artifact: "state_current",
		strictMode: strictCanonicalMode,
	});

	const history = await readJsonMarkdown(args.historyPath);
	const existingHistoryRaw = await readTextIfExists(args.historyPath);
	const existingHistoryContent = existingHistoryRaw
		? parseMarkdown(existingHistoryRaw).content.trim()
		: "";
	const historyEntry =
		`${args.nowIso} | intent=setup | action="campaign init" | ` +
		`dice_roller=${args.resolvedDiceRoller ?? "unset"} | ` +
		`theme=${args.resolvedTheme ?? "unset"} | ` +
		`scene_source=${args.startingSceneSource}`;
	const nextHistoryContent = existingHistoryContent
		? `${existingHistoryContent}\n${historyEntry}`
		: historyEntry;

	await ensureParentDirectoryExists(args.historyPath);
	await writeFile(
		args.historyPath,
		renderMarkdown(
			{
				description:
					history.frontmatter.description ??
					"Chronological campaign action history log",
				title: history.frontmatter.title ?? "Campaign History",
			},
			nextHistoryContent,
		),
		"utf8",
	);
	recordLegacyCompatibilityWriteMetric({
		consumer: "init",
		artifact: "state_history",
		strictMode: strictCanonicalMode,
	});

	return nextState;
}
