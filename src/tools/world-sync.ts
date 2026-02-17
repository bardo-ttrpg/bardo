import { mkdir, writeFile } from "node:fs/promises";
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

const defaultOptionalSystems: OptionalSystems = {
	npcs: true,
	quests: true,
	items: true,
	worldGeneration: true,
};

function parseJsonObject(raw: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
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

async function loadOptionalSystems(bardoRoot: string): Promise<OptionalSystems> {
	const settingsPath = resolvePathInsideRoot(bardoRoot, "_settings/settings.md");
	const legacySettingsPath = resolvePathInsideRoot(bardoRoot, "state/settings.md");

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

function slugify(input: string): string {
	const slug = input
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-");
	return slug || "unknown";
}

function toDisplayName(slugOrText: string): string {
	return slugOrText
		.replace(/-/g, " ")
		.replace(/\b\w/g, (m) => m.toUpperCase())
		.trim();
}

function toTitleCase(text: string): string {
	return text
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word[0]?.toUpperCase() + word.slice(1))
		.join(" ")
		.trim();
}

function extractLocationNames(transcript: string): string[] {
	const names = new Set<string>();

	const signPattern = /WELCOME TO\s+([A-Z][A-Z\s'\-]{1,60})/g;
	for (const match of transcript.matchAll(signPattern)) {
		const raw = match[1]?.trim();
		if (!raw) continue;
		names.add(toTitleCase(raw));
	}

	const welcomePattern =
		/\bwelcome to\s+([A-Z][a-zA-Z'\-]*(?:\s+[A-Z][a-zA-Z'\-]*){0,3})\b/g;
	for (const match of transcript.matchAll(welcomePattern)) {
		const raw = match[1]?.trim();
		if (!raw) continue;
		names.add(raw);
	}

	const calledPattern =
		/\b(?:called|named)\s+([A-Z][a-zA-Z'\-]*(?:\s+[A-Z][a-zA-Z'\-]*){0,3})\b/g;
	for (const match of transcript.matchAll(calledPattern)) {
		const raw = match[1]?.trim();
		if (!raw) continue;
		names.add(raw);
	}

	return [...names];
}

function extractNpcNames(transcript: string): string[] {
	const names = new Set<string>();
	const introPattern =
		/"[^"\n]{0,220}\b(?:i am|i'm|my name is)\s+([A-Z][a-zA-Z'\-]{1,30})\b[^"\n]*"/g;

	for (const match of transcript.matchAll(introPattern)) {
		const raw = match[1]?.trim();
		if (!raw) continue;
		names.add(raw);
	}

	return [...names];
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
			lastAction: typeof parsed.lastAction === "string" ? parsed.lastAction : "",
		};
	} catch {
		return newStateTemplate();
	}
}

const worldSyncInputSchema = z.object({
	transcript: z
		.string()
		.min(1)
		.max(40_000)
		.describe(
			"Narrative text block or conversation snippet to sync discovered names (NPCs/locations) into workspace files.",
		),
	currentLocationHint: z
		.string()
		.optional()
		.describe("Optional current location slug/name hint for linking discovered NPCs"),
});

const worldSyncOutputSchema = z.object({
	success: z.boolean().describe("True when world sync completed"),
	message: z.string().describe("Human-readable summary"),
	rootPath: z.string().describe("Absolute bardo root path"),
	statePath: z.string(),
	historyPath: z.string(),
	extractedLocationNames: z.array(z.string()),
	extractedNpcNames: z.array(z.string()),
	createdLocationIds: z.array(z.string()),
	createdNpcIds: z.array(z.string()),
	existingLocationIds: z.array(z.string()),
	existingNpcIds: z.array(z.string()),
	currentLocationAfter: z.string(),
	optionalSystems: z.object({
		npcs: z.boolean(),
		quests: z.boolean(),
		items: z.boolean(),
		worldGeneration: z.boolean(),
	}),
});

type WorldSyncOutput = z.infer<typeof worldSyncOutputSchema>;

export function registerWorldSyncTool(server: McpServer, auth: AuthContext): void {
	server.registerTool(
		"world_sync",
		{
			title: "Sync Narrative Discoveries",
			description:
				"Persist discovered proper names from narrative text into workspace files and state. Use this when narration introduces a new location or NPC so canon data stays consistent.",
			inputSchema: worldSyncInputSchema,
			outputSchema: worldSyncOutputSchema,
			annotations: {
				title: "Sync Narrative Discoveries",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async ({ transcript, currentLocationHint }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const statePath = resolvePathInsideRoot(bardoRoot, "state/current.md");
			const historyPath = resolvePathInsideRoot(bardoRoot, "state/history.md");

			try {
				const optionalSystems = await loadOptionalSystems(bardoRoot);
				await mkdir(resolvePathInsideRoot(bardoRoot, "entities"), {
					recursive: true,
				});
				await mkdir(resolvePathInsideRoot(bardoRoot, "world/locations"), {
					recursive: true,
				});
				await mkdir(resolvePathInsideRoot(bardoRoot, "state"), {
					recursive: true,
				});

				const extractedLocationNames = extractLocationNames(transcript);
				const extractedNpcNames = extractNpcNames(transcript);
				const createdLocationIds: string[] = [];
				const createdNpcIds: string[] = [];
				const existingLocationIds: string[] = [];
				const existingNpcIds: string[] = [];

				const rawStateMarkdown = await readTextIfExists(statePath);
				const parsedStateMarkdown = rawStateMarkdown
					? parseMarkdown(rawStateMarkdown)
					: { frontmatter: {}, content: "" };
				const state = safeParseState(parsedStateMarkdown.content);

				let preferredLocationSlug = state.currentLocation;
				if (currentLocationHint?.trim()) {
					const hinted = slugify(currentLocationHint);
					preferredLocationSlug = hinted;
				}

				for (const locationName of extractedLocationNames) {
					const locationSlug = slugify(locationName);
					if (!state.locations[locationSlug]) {
						state.locations[locationSlug] = {
							name: locationName,
							visits: 0,
							npcIds: [],
						};
					}

					if (optionalSystems.worldGeneration) {
						const locationPath = resolvePathInsideRoot(
							bardoRoot,
							`world/locations/${locationSlug}.md`,
						);
						const existing = await readTextIfExists(locationPath);
						if (existing === null) {
							await ensureParentDirectoryExists(locationPath);
							await writeFile(
								locationPath,
								renderMarkdown(
									{
										description: "Location or point of interest",
										title: locationName,
									},
									JSON.stringify(
										{
											id: locationSlug,
											name: locationName,
											discoveryStatus: "known",
											tags: ["location"],
											notes:
												"Synchronized from narrative discovery. Expand details as campaign evolves.",
										},
										null,
										2,
									),
								),
								"utf8",
							);
							createdLocationIds.push(locationSlug);
						} else {
							existingLocationIds.push(locationSlug);
						}
					}

					preferredLocationSlug = locationSlug;
				}

				for (const npcName of extractedNpcNames) {
					if (!optionalSystems.npcs) {
						continue;
					}
					const npcId = slugify(npcName);
					const npcPath = resolvePathInsideRoot(bardoRoot, `entities/${npcId}.md`);
					const existing = await readTextIfExists(npcPath);

					if (existing === null) {
						await ensureParentDirectoryExists(npcPath);
						await writeFile(
							npcPath,
							renderMarkdown(
								{
									description:
										"NPC record synchronized from narrative discovery",
									title: npcName,
								},
								JSON.stringify(
									{
										id: npcId,
										publicName: npcName,
										trueName: npcName,
										discoveryStatus: "known",
										knownByPlayer: true,
										currentLocation: preferredLocationSlug,
										notes:
											"Name discovered in narrative; expand role, goals, and relationships.",
									},
									null,
									2,
								),
							),
							"utf8",
						);
						createdNpcIds.push(npcId);
					} else {
						existingNpcIds.push(npcId);
					}

					if (!state.locations[preferredLocationSlug]) {
						state.locations[preferredLocationSlug] = {
							name: toDisplayName(preferredLocationSlug),
							visits: 0,
							npcIds: [],
						};
					}
					if (!state.locations[preferredLocationSlug]?.npcIds.includes(npcId)) {
						state.locations[preferredLocationSlug]?.npcIds.push(npcId);
					}
				}

				if (preferredLocationSlug) {
					state.currentLocation = preferredLocationSlug;
				}
				state.lastAction = "world_sync";

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

				const historyEntry = `${new Date().toISOString()} | intent=sync | action="world_sync" | locations_created=${createdLocationIds.length} | npcs_created=${createdNpcIds.length}`;
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

				const output: WorldSyncOutput = {
					success: true,
					message:
						createdLocationIds.length === 0 && createdNpcIds.length === 0
							? "World sync complete. No new entities were added."
							: "World sync complete. Narrative discoveries were persisted.",
					rootPath: bardoRoot,
					statePath,
					historyPath,
					extractedLocationNames,
					extractedNpcNames,
					createdLocationIds,
					createdNpcIds,
					existingLocationIds,
					existingNpcIds,
					currentLocationAfter: state.currentLocation,
					optionalSystems,
				};
				return makeToolResult(output);
			} catch (error) {
				const output: WorldSyncOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to sync world discoveries: ${error.message}`
							: "Failed to sync world discoveries.",
					rootPath: bardoRoot,
					statePath,
					historyPath,
					extractedLocationNames: [],
					extractedNpcNames: [],
					createdLocationIds: [],
					createdNpcIds: [],
					existingLocationIds: [],
					existingNpcIds: [],
					currentLocationAfter: "",
					optionalSystems: { ...defaultOptionalSystems },
				};
				return makeToolResult(output, true);
			}
		},
	);
}
