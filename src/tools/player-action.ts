import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
	ensureParentDirectoryExists,
	readTextIfExists,
	resolveBardoRoot,
	resolvePathInsideRoot,
} from "../lib/filesystem";
import { parseMarkdown, renderMarkdown } from "../lib/markdown";
import { makeToolResult } from "../lib/tool-result";
import type { AuthContext } from "../types";

type Intent = "travel" | "explore" | "social" | "rest" | "combat" | "general";

type CampaignState = {
	worldTimeISO: string;
	currentLocation: string;
	counters: {
		unknownNpc: number;
		unknownLocation: number;
	};
	locations: Record<
		string,
		{
			name: string;
			visits: number;
			npcIds: string[];
		}
	>;
	lastAction: string;
};

type OptionalSystems = {
	npcs: boolean;
	quests: boolean;
	items: boolean;
	worldGeneration: boolean;
};

type KnownLocation = {
	slug: string;
	name: string;
};

const defaultOptionalSystems: OptionalSystems = {
	npcs: true,
	quests: true,
	items: true,
	worldGeneration: true,
};

function parseJsonObject(raw: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(raw);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
		) {
			return parsed as Record<string, unknown>;
		}
		return null;
	} catch {
		return null;
	}
}

function normalizeOptionalSystems(value: unknown): OptionalSystems {
	if (typeof value !== "object" || value === null) {
		return { ...defaultOptionalSystems };
	}
	const record = value as Record<string, unknown>;
	return {
		npcs:
			typeof record.npcs === "boolean"
				? record.npcs
				: defaultOptionalSystems.npcs,
		quests:
			typeof record.quests === "boolean"
				? record.quests
				: defaultOptionalSystems.quests,
		items:
			typeof record.items === "boolean"
				? record.items
				: defaultOptionalSystems.items,
		worldGeneration:
			typeof record.worldGeneration === "boolean"
				? record.worldGeneration
				: defaultOptionalSystems.worldGeneration,
	};
}

async function loadOptionalSystems(
	bardoRoot: string,
): Promise<OptionalSystems> {
	const settingsPath = resolvePathInsideRoot(
		bardoRoot,
		"_settings/settings.md",
	);
	const legacySettingsPath = resolvePathInsideRoot(
		bardoRoot,
		"state/settings.md",
	);

	for (const filePath of [settingsPath, legacySettingsPath]) {
		const raw = await readTextIfExists(filePath);
		if (raw === null) continue;
		const parsed = parseMarkdown(raw);
		const data = parseJsonObject(parsed.content.trim());
		if (data && "optionalSystems" in data) {
			return normalizeOptionalSystems(data.optionalSystems);
		}
	}

	return { ...defaultOptionalSystems };
}

async function loadKnownLocations(bardoRoot: string): Promise<KnownLocation[]> {
	const locationsDir = resolvePathInsideRoot(bardoRoot, "world/locations");
	try {
		const entries = await readdir(locationsDir, { withFileTypes: true });
		const known: KnownLocation[] = [];
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
				continue;
			}

			const locationPath = resolvePathInsideRoot(
				bardoRoot,
				`world/locations/${entry.name}`,
			);
			const raw = await readTextIfExists(locationPath);
			if (raw === null) {
				continue;
			}

			const parsed = parseMarkdown(raw);
			const slug = entry.name.replace(/\.md$/i, "");
			const name = parsed.frontmatter.title?.trim() || toDisplayName(slug);
			known.push({ slug, name });
		}
		return known;
	} catch {
		return [];
	}
}

function isGenericTravelTarget(text: string): boolean {
	const normalized = text.trim().toLowerCase();
	return [
		"village",
		"the village",
		"town",
		"the town",
		"city",
		"the city",
		"settlement",
		"hamlet",
		"camp",
		"outpost",
	].includes(normalized);
}

function resolveTravelTarget(
	targetText: string,
	knownLocations: KnownLocation[],
): { slug: string; name: string } {
	const candidateSlug = slugify(targetText);
	const candidateLower = targetText.trim().toLowerCase();

	const exactSlugMatch = knownLocations.find(
		(location) => location.slug === candidateSlug,
	);
	if (exactSlugMatch) {
		return { slug: exactSlugMatch.slug, name: exactSlugMatch.name };
	}

	const exactNameMatch = knownLocations.find(
		(location) => location.name.trim().toLowerCase() === candidateLower,
	);
	if (exactNameMatch) {
		return { slug: exactNameMatch.slug, name: exactNameMatch.name };
	}

	const partialNameMatch = knownLocations.find((location) =>
		location.name.trim().toLowerCase().includes(candidateLower),
	);
	if (partialNameMatch) {
		return { slug: partialNameMatch.slug, name: partialNameMatch.name };
	}

	if (isGenericTravelTarget(targetText) && knownLocations.length === 1) {
		const only = knownLocations[0];
		if (only) {
			return { slug: only.slug, name: only.name };
		}
	}

	return { slug: candidateSlug, name: toDisplayName(targetText) };
}

const playerActionInputSchema = z.object({
	action: z
		.string()
		.min(1)
		.describe(
			"Natural player action message from the user (use this as the default gameplay entrypoint), e.g. `I travel to the village tavern`",
		)
		.max(1000),
});

const playerActionOutputSchema = z.object({
	success: z.boolean().describe("True when the action was processed"),
	message: z.string().describe("Human-readable action summary"),
	rootPath: z.string().describe("Absolute bardo root path"),
	intent: z
		.enum(["travel", "explore", "social", "rest", "combat", "general"])
		.describe("Parsed high-level intent"),
	timeAdvancedMinutes: z.number().int().nonnegative(),
	worldTimeBeforeISO: z.string(),
	worldTimeAfterISO: z.string(),
	locationBefore: z.string(),
	locationAfter: z.string(),
	createdNpcIds: z.array(z.string()),
	createdLocationIds: z.array(z.string()),
	historyEntry: z.string(),
	statePath: z.string(),
	historyPath: z.string(),
	narrationGuardrails: z.array(z.string()),
	optionalSystems: z.object({
		npcs: z.boolean(),
		quests: z.boolean(),
		items: z.boolean(),
		worldGeneration: z.boolean(),
	}),
});

type PlayerActionOutput = z.infer<typeof playerActionOutputSchema>;

function slugify(input: string): string {
	const slug = input
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-");
	return slug || "unknown-place";
}

function toDisplayName(slugOrText: string): string {
	return slugOrText
		.replace(/-/g, " ")
		.replace(/\b\w/g, (m) => m.toUpperCase())
		.trim();
}

function extractTargetLocation(action: string): string | null {
	const direct = action.match(
		/(?:travel|go|walk|journey|head|move|ride|sail|enter)\s+(?:to|toward|into)?\s*(?:the\s+)?([a-z0-9'\-\s]{2,80})/i,
	);
	if (direct?.[1]) {
		return direct[1].trim();
	}
	const preposition = action.match(
		/(?:to|toward|into)\s+(?:the\s+)?([a-z0-9'\-\s]{2,80})/i,
	);
	if (preposition?.[1]) {
		return preposition[1].trim();
	}
	return null;
}

function parseIntent(action: string): Intent {
	const text = action.toLowerCase();
	if (
		/(travel|go\s+to|walk\s+to|journey|head\s+to|move\s+to|ride\s+to|sail\s+to|enter)/.test(
			text,
		)
	) {
		return "travel";
	}
	if (/(explore|search|investigate|scout|look around)/.test(text)) {
		return "explore";
	}
	if (/(talk|speak|ask|chat|convince|persuade|negotiate)/.test(text)) {
		return "social";
	}
	if (/(rest|sleep|camp|wait)/.test(text)) {
		return "rest";
	}
	if (/(fight|attack|battle|combat|ambush)/.test(text)) {
		return "combat";
	}
	return "general";
}

function defaultAdvanceMinutes(intent: Intent): number {
	switch (intent) {
		case "travel":
			return 60;
		case "explore":
			return 45;
		case "social":
			return 20;
		case "rest":
			return 480;
		case "combat":
			return 30;
		default:
			return 15;
	}
}

function normalizeIsoDate(input: string): string {
	const date = new Date(input);
	if (Number.isNaN(date.getTime())) {
		return new Date().toISOString();
	}
	return date.toISOString();
}

function newStateTemplate(): CampaignState {
	return {
		worldTimeISO: new Date().toISOString(),
		currentLocation: "starting-area",
		counters: {
			unknownNpc: 0,
			unknownLocation: 0,
		},
		locations: {},
		lastAction: "",
	};
}

function safeParseState(rawBody: string): CampaignState {
	if (!rawBody.trim()) {
		return newStateTemplate();
	}

	try {
		const parsed = JSON.parse(rawBody) as Partial<CampaignState>;
		return {
			worldTimeISO:
				typeof parsed.worldTimeISO === "string"
					? parsed.worldTimeISO
					: new Date().toISOString(),
			currentLocation:
				typeof parsed.currentLocation === "string"
					? parsed.currentLocation
					: "starting-area",
			counters: {
				unknownNpc:
					typeof parsed.counters?.unknownNpc === "number"
						? parsed.counters.unknownNpc
						: 0,
				unknownLocation:
					typeof parsed.counters?.unknownLocation === "number"
						? parsed.counters.unknownLocation
						: 0,
			},
			locations:
				typeof parsed.locations === "object" && parsed.locations !== null
					? (parsed.locations as CampaignState["locations"])
					: {},
			lastAction:
				typeof parsed.lastAction === "string" ? parsed.lastAction : "",
		};
	} catch {
		return newStateTemplate();
	}
}

async function ensureLocationFile(
	bardoRoot: string,
	locationSlug: string,
	locationName: string,
): Promise<{ created: boolean; path: string }> {
	const locationPath = resolvePathInsideRoot(
		bardoRoot,
		`world/locations/${locationSlug}.md`,
	);
	const existing = await readTextIfExists(locationPath);
	if (existing !== null) {
		return { created: false, path: locationPath };
	}

	await ensureParentDirectoryExists(locationPath);
	const payload = {
		id: locationSlug,
		name: locationName,
		discoveryStatus: "unknown",
		tags: ["location", "point_of_interest"],
		notes: "Auto-generated from player action. Expand with concrete details.",
	};
	await writeFile(
		locationPath,
		renderMarkdown(
			{
				description: "Location or point of interest",
				title: locationName,
			},
			JSON.stringify(payload, null, 2),
		),
		"utf8",
	);
	return { created: true, path: locationPath };
}

async function createUnknownNpc(
	bardoRoot: string,
	npcIndex: number,
	locationSlug: string,
): Promise<{ id: string; path: string }> {
	const npcId = `unknown_npc_${String(npcIndex).padStart(2, "0")}`;
	const npcPath = resolvePathInsideRoot(bardoRoot, `entities/${npcId}.md`);
	await ensureParentDirectoryExists(npcPath);
	const payload = {
		id: npcId,
		publicName: `Unknown NPC ${String(npcIndex).padStart(2, "0")}`,
		trueName: null,
		discoveryStatus: "unknown",
		knownByPlayer: false,
		currentLocation: locationSlug,
		revealConditions: [
			"Spend meaningful time interacting",
			"Learn a personal detail or earn trust",
		],
		notes: "Auto-generated ambient NPC. Discover identity through play.",
	};

	await writeFile(
		npcPath,
		renderMarkdown(
			{
				description:
					"NPC record; initially unknown until discovered by the player",
				title: `Unknown NPC ${String(npcIndex).padStart(2, "0")}`,
			},
			JSON.stringify(payload, null, 2),
		),
		"utf8",
	);

	return { id: npcId, path: npcPath };
}

export function registerPlayerActionTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"player_action",
		{
			title: "Process Player Action (Primary)",
			description:
				"Primary high-level gameplay tool and default for narrative user inputs (for example: `I travel to the village`, `I explore the ruins`, `I talk to the bartender`). It parses intent, advances world time automatically, updates persistent state/history, and creates unknown NPCs/locations when appropriate.",
			inputSchema: playerActionInputSchema,
			outputSchema: playerActionOutputSchema,
			annotations: {
				title: "Process Player Action",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: true,
			},
		},
		async ({ action }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const statePath = resolvePathInsideRoot(bardoRoot, "state/current.md");
			const historyPath = resolvePathInsideRoot(bardoRoot, "state/history.md");
			const createdNpcIds: string[] = [];
			const createdLocationIds: string[] = [];

			try {
				const optionalSystems = await loadOptionalSystems(bardoRoot);
				const knownLocations = await loadKnownLocations(bardoRoot);
				await mkdir(bardoRoot, { recursive: true });
				await mkdir(resolvePathInsideRoot(bardoRoot, "entities"), {
					recursive: true,
				});
				await mkdir(resolvePathInsideRoot(bardoRoot, "world/locations"), {
					recursive: true,
				});
				await mkdir(resolvePathInsideRoot(bardoRoot, "state"), {
					recursive: true,
				});

				const rawStateMarkdown = await readTextIfExists(statePath);
				const parsedStateMarkdown = rawStateMarkdown
					? parseMarkdown(rawStateMarkdown)
					: { frontmatter: {}, content: "" };
				const state = safeParseState(parsedStateMarkdown.content);

				const intent = parseIntent(action);
				const locationBefore = state.currentLocation;
				const targetLocationText = extractTargetLocation(action);
				let locationAfter = state.currentLocation;

				if (intent === "travel" && targetLocationText) {
					const resolved = resolveTravelTarget(
						targetLocationText,
						knownLocations,
					);
					const targetSlug = resolved.slug;
					locationAfter = targetSlug;
					if (!state.locations[targetSlug]) {
						state.locations[targetSlug] = {
							name: resolved.name,
							visits: 0,
							npcIds: [],
						};
					}

					if (optionalSystems.worldGeneration) {
						const ensuredLocation = await ensureLocationFile(
							bardoRoot,
							targetSlug,
							state.locations[targetSlug].name,
						);
						if (ensuredLocation.created) {
							createdLocationIds.push(targetSlug);
						}
					}
				}

				if (!state.locations[locationAfter]) {
					state.counters.unknownLocation += 1;
					const generatedSlug =
						locationAfter ||
						`unknown-location-${state.counters.unknownLocation}`;
					locationAfter = generatedSlug;
					state.locations[generatedSlug] = {
						name: toDisplayName(generatedSlug),
						visits: 0,
						npcIds: [],
					};
					if (optionalSystems.worldGeneration) {
						const ensuredLocation = await ensureLocationFile(
							bardoRoot,
							generatedSlug,
							state.locations[generatedSlug].name,
						);
						if (ensuredLocation.created) {
							createdLocationIds.push(generatedSlug);
						}
					}
				}

				state.currentLocation = locationAfter;
				const locationRecord = state.locations[locationAfter];
				if (!locationRecord) {
					throw new Error("Failed to resolve location record for action.");
				}
				locationRecord.visits += 1;

				const shouldSpawnAmbient = intent === "travel" || intent === "explore";
				if (shouldSpawnAmbient && optionalSystems.npcs) {
					const existingAtLocation = locationRecord.npcIds.length;
					const desiredMinimum = 2;
					const toCreate = Math.max(0, desiredMinimum - existingAtLocation);
					for (let i = 0; i < toCreate; i += 1) {
						state.counters.unknownNpc += 1;
						const npc = await createUnknownNpc(
							bardoRoot,
							state.counters.unknownNpc,
							locationAfter,
						);
						locationRecord.npcIds.push(npc.id);
						createdNpcIds.push(npc.id);
					}
				}

				const worldTimeBeforeISO = normalizeIsoDate(state.worldTimeISO);
				const advance = defaultAdvanceMinutes(intent);
				const nextWorldTime = new Date(worldTimeBeforeISO);
				nextWorldTime.setMinutes(nextWorldTime.getMinutes() + advance);
				const worldTimeAfterISO = nextWorldTime.toISOString();
				state.worldTimeISO = worldTimeAfterISO;
				state.lastAction = action;

				await ensureParentDirectoryExists(statePath);
				await writeFile(
					statePath,
					renderMarkdown(
						{
							description: "Current campaign state and memory snapshot",
							title: "Campaign State",
						},
						JSON.stringify(state, null, 2),
					),
					"utf8",
				);

				const historyEntry = `${worldTimeAfterISO} | intent=${intent} | action="${action}" | from=${locationBefore} | to=${locationAfter} | new_npcs=${createdNpcIds.length} | new_locations=${createdLocationIds.length}`;
				const existingHistory = await readTextIfExists(historyPath);
				const parsedHistory = existingHistory
					? parseMarkdown(existingHistory)
					: { frontmatter: {}, content: "" };
				const nextHistoryContent = parsedHistory.content.trim()
					? `${parsedHistory.content.trimEnd()}\n${historyEntry}`
					: historyEntry;
				await ensureParentDirectoryExists(historyPath);
				await writeFile(
					historyPath,
					renderMarkdown(
						{
							description: "Chronological campaign action history log",
							title: "Campaign History",
						},
						nextHistoryContent,
					),
					"utf8",
				);

				const output: PlayerActionOutput = {
					success: true,
					message:
						createdNpcIds.length > 0 || createdLocationIds.length > 0
							? "Action processed. Time advanced and world context expanded automatically."
							: "Action processed. Time advanced and state updated.",
					rootPath: bardoRoot,
					intent,
					timeAdvancedMinutes: advance,
					worldTimeBeforeISO,
					worldTimeAfterISO,
					locationBefore,
					locationAfter,
					createdNpcIds,
					createdLocationIds,
					historyEntry,
					statePath,
					historyPath,
					narrationGuardrails: [
						"Use only locations already in workspace/state unless a tool call creates a new one.",
						"Keep unnamed characters as unknown NPCs until identity is discovered and persisted.",
						"When new proper names appear in narrative, sync them to workspace before reuse.",
					],
					optionalSystems,
				};
				return makeToolResult(output);
			} catch (error) {
				const output: PlayerActionOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to process player action: ${error.message}`
							: "Failed to process player action.",
					rootPath: bardoRoot,
					intent: "general",
					timeAdvancedMinutes: 0,
					worldTimeBeforeISO: "",
					worldTimeAfterISO: "",
					locationBefore: "",
					locationAfter: "",
					createdNpcIds: [],
					createdLocationIds: [],
					historyEntry: "",
					statePath,
					historyPath,
					narrationGuardrails: [],
					optionalSystems: { ...defaultOptionalSystems },
				};
				return makeToolResult(output, true);
			}
		},
	);
}
