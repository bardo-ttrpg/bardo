import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type CampaignBootstrapReadiness =
	| "ready"
	| "ready-with-gaps"
	| "needs-user-input";

type CampaignBootstrapArgs = {
	workspaceRoot: string;
	bardoRoot: string;
	nowIso: string;
};

type SourceEntry = {
	relativePath: string;
	role: "campaign-file" | "rules-source";
	status: "included" | "skipped";
	byteSize: number;
	skippedReason?: string;
};

type EntityIndex = {
	characters: string[];
	locations: string[];
	quests: string[];
	factions: string[];
	recentEvents: string[];
	facts: string[];
	clocks: string[];
};

type CurrentStateModel = {
	currentLocation: string | null;
	activeQuests: string[];
	relevantFactions: string[];
	recentEvents: string[];
	uncertainties: string[];
	factsRevealed: string[];
	factionConsequences: string[];
	npcAttitudes: Record<string, string>;
	clockProgress: string[];
	resourcesSpent: string[];
	damageTaken: string[];
	activeCorrections: string[];
};

type TrackingProfile = {
	strong: string[];
	light: string[];
	onDemand: string[];
};

type Candidate = {
	value: string;
	strength: number;
	source: string;
};

type ExtractedCampaignData = {
	entities: EntityIndex;
	currentLocationCandidates: Candidate[];
	uncertainties: string[];
	gaps: string[];
	factsRevealed: string[];
	factionConsequences: string[];
	npcAttitudes: Record<string, string>;
	clockProgress: string[];
};

const MAX_CAMPAIGN_SOURCE_BYTES = 512 * 1024;
const IGNORED_DISCOVERY_DIRECTORIES = new Set([
	".bardo",
	".codex",
	".config",
	".git",
	".next",
	".opencode",
	".turbo",
	".venv",
	"bin",
	"build",
	"coverage",
	"dist",
	"install-root",
	"node_modules",
	"venv",
	"workspaces",
]);
const IGNORED_DISCOVERY_FILES = new Set(["stress-report.json"]);

export async function bootstrapCampaignWorkspace(
	args: CampaignBootstrapArgs,
): Promise<{
	sourceIndexPath: string;
	entitiesPath: string;
	currentStatePath: string;
	trackingProfilePath: string;
	readinessPath: string;
	readiness: {
		status: CampaignBootstrapReadiness;
		gaps: string[];
	};
}> {
	const rulesIndexPath = path.join(args.bardoRoot, "rules/normalized/index.json");
	const hasRulesBootstrap = await stat(rulesIndexPath)
		.then(() => true)
		.catch((error: unknown) => {
			if (
				typeof error === "object" &&
				error !== null &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return false;
			}
			throw error;
		});

	const sourceIndexPath = "manifests/source-index.json";
	const entitiesPath = "entities/campaign-entities.json";
	const currentStatePath = "state/current-state.json";
	const trackingProfilePath = "simulation/tracking-profile.json";
	const readinessPath = "manifests/readiness.json";

	if (!hasRulesBootstrap) {
		await ensureJsonFile(
			path.join(args.bardoRoot, readinessPath),
			{
				status: "needs-user-input" satisfies CampaignBootstrapReadiness,
				gaps: [
					"Rules bootstrap must complete before campaign bootstrap can begin.",
				],
				updatedAtISO: args.nowIso,
			},
		);
		return {
			sourceIndexPath,
			entitiesPath,
			currentStatePath,
			trackingProfilePath,
			readinessPath,
			readiness: {
				status: "needs-user-input",
				gaps: [
					"Rules bootstrap must complete before campaign bootstrap can begin.",
				],
			},
		};
	}

	const sourceEntries = await collectWorkspaceSources(args.workspaceRoot);
	const extracted = await extractCampaignData({
		workspaceRoot: args.workspaceRoot,
		sources: sourceEntries,
	});
	const currentState = deriveCurrentState(extracted);
	const trackingProfile = deriveTrackingProfile(extracted.entities, currentState);
	const gaps = deriveReadinessGaps(extracted, currentState);
	const readiness: CampaignBootstrapReadiness =
		gaps.length === 0
			? "ready"
			: currentState.currentLocation || currentState.activeQuests.length > 0
				? "ready-with-gaps"
				: "needs-user-input";

	await ensureJsonFile(path.join(args.bardoRoot, sourceIndexPath), {
		sources: sourceEntries,
		updatedAtISO: args.nowIso,
	});
	await ensureJsonFile(path.join(args.bardoRoot, entitiesPath), {
		...extracted.entities,
		updatedAtISO: args.nowIso,
	});
	await ensureJsonFile(path.join(args.bardoRoot, currentStatePath), {
		...currentState,
		updatedAtISO: args.nowIso,
	});
	await ensureJsonFile(path.join(args.bardoRoot, trackingProfilePath), {
		...trackingProfile,
		updatedAtISO: args.nowIso,
	});
	await ensureJsonFile(path.join(args.bardoRoot, readinessPath), {
		status: readiness,
		gaps,
		updatedAtISO: args.nowIso,
	});

	return {
		sourceIndexPath,
		entitiesPath,
		currentStatePath,
		trackingProfilePath,
		readinessPath,
		readiness: {
			status: readiness,
			gaps,
		},
	};
}

async function collectWorkspaceSources(
	workspaceRoot: string,
): Promise<SourceEntry[]> {
	const results: SourceEntry[] = [];
	await walkWorkspace(workspaceRoot, workspaceRoot, results);
	return results;
}

async function walkWorkspace(
	rootPath: string,
	currentPath: string,
	results: SourceEntry[],
): Promise<void> {
	const entries = await readdir(currentPath, { withFileTypes: true });
	for (const entry of entries) {
		if (IGNORED_DISCOVERY_DIRECTORIES.has(entry.name)) {
			continue;
		}

		const nextPath = path.join(currentPath, entry.name);
		if (entry.isDirectory()) {
			await walkWorkspace(rootPath, nextPath, results);
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		if (IGNORED_DISCOVERY_FILES.has(entry.name)) {
			continue;
		}

		const extension = path.extname(entry.name).toLowerCase();
		if (![".md", ".mdx", ".txt", ".json"].includes(extension)) {
			continue;
		}

		const details = await stat(nextPath);
		const relativePath = path
			.relative(rootPath, nextPath)
			.replaceAll("\\", "/");
		const role = entry.name === "rulebook.md" ? "rules-source" : "campaign-file";
		if (details.size > MAX_CAMPAIGN_SOURCE_BYTES) {
			results.push({
				relativePath,
				role,
				status: "skipped",
				byteSize: details.size,
				skippedReason: `Skipped oversized source ${relativePath} (${details.size} bytes > ${MAX_CAMPAIGN_SOURCE_BYTES} byte limit).`,
			});
			continue;
		}

		results.push({
			relativePath,
			role,
			status: "included",
			byteSize: details.size,
		});
	}
}

async function extractCampaignData(args: {
	workspaceRoot: string;
	sources: SourceEntry[];
}): Promise<ExtractedCampaignData> {
	const locations: string[] = [];
	const quests: string[] = [];
	const factions: string[] = [];
	const recentEvents: string[] = [];
	const facts: string[] = [];
	const clocks: string[] = [];
	const characters: string[] = [];
	const uncertainties: string[] = [];
	const factsRevealed: string[] = [];
	const factionConsequences: string[] = [];
	const clockProgress: string[] = [];
	const npcAttitudes: Record<string, string> = {};
	const gaps = args.sources
		.filter((source) => source.role === "campaign-file")
		.map((source) => source.skippedReason)
		.filter((value): value is string => typeof value === "string");
	const currentLocationCandidates: Candidate[] = [];

	for (const source of args.sources) {
		if (source.role !== "campaign-file" || source.status === "skipped") {
			continue;
		}
		const raw = await readFile(
			path.join(args.workspaceRoot, source.relativePath),
			"utf8",
		).catch(() => "");
		if (!raw) {
			gaps.push(
				`Could not read campaign source ${source.relativePath}; review the file before trusting generated state.`,
			);
			continue;
		}
		const lines = raw.split(/\r?\n/);
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}

			const explicitCurrent = parsePrefixedValue(trimmed, [
				"Current location:",
				"Location:",
			]);
			if (explicitCurrent) {
				locations.push(explicitCurrent);
				currentLocationCandidates.push({
					value: explicitCurrent,
					strength: trimmed.toLowerCase().startsWith("current location:")
						? 5
						: 4,
					source: source.relativePath,
				});
			}

			const possibleLocation = parsePrefixedValue(trimmed, ["Possible location:"]);
			if (possibleLocation) {
				locations.push(possibleLocation);
				currentLocationCandidates.push({
					value: possibleLocation,
					strength: 1,
					source: source.relativePath,
				});
				uncertainties.push(
					`Possible location remains unresolved in ${source.relativePath}: ${possibleLocation}.`,
				);
			}

			for (const inferred of inferLocationCandidates(trimmed, source.relativePath)) {
				locations.push(inferred.value);
				currentLocationCandidates.push(inferred);
			}
			for (const referencedLocation of inferReferencedLocations(trimmed)) {
				locations.push(referencedLocation);
			}

			const quest = parsePrefixedValue(trimmed, [
				"Active quest:",
				"Quest:",
				"Quest lead:",
				"Objective:",
			]);
			if (quest) {
				quests.push(quest);
			}

			const faction = parsePrefixedValue(trimmed, [
				"Faction in play:",
				"Faction:",
			]);
			if (faction) {
				factions.push(stripTrailingContext(faction));
			}

			const event = parsePrefixedText(trimmed, ["Recent event:", "Event:"]);
			if (event) {
				recentEvents.push(normalizeFreeformValue(event));
			}

			const fact = parsePrefixedText(trimmed, ["Fact revealed:", "Fact:"]);
			if (fact) {
				const normalizedFact = normalizeFreeformValue(fact);
				facts.push(normalizedFact);
				factsRevealed.push(normalizedFact);
			}

			const consequence = parsePrefixedText(trimmed, [
				"Faction consequence:",
				"Consequence:",
			]);
			if (consequence) {
				factionConsequences.push(normalizeFreeformValue(consequence));
			}

			const character = parsePrefixedValue(trimmed, ["Character:", "NPC:"]);
			if (character) {
				characters.push(character);
			}

			const npcAttitude = parseNpcAttitude(trimmed);
			if (npcAttitude) {
				characters.push(npcAttitude.name);
				npcAttitudes[npcAttitude.name] = npcAttitude.attitude;
			}

			const clock = parsePrefixedText(trimmed, [
				"Clock progress:",
				"Clock:",
				"Time marker:",
			]);
			if (clock) {
				const normalizedClock = normalizeFreeformValue(clock);
				clockProgress.push(normalizedClock);
				const clockName = inferClockName(normalizedClock);
				if (clockName) {
					clocks.push(clockName);
				}
			}

			const uncertainty = parsePrefixedValue(trimmed, [
				"Uncertainty:",
				"Open question:",
				"Unknown:",
			]);
			if (uncertainty) {
				uncertainties.push(normalizeFreeformValue(uncertainty));
			}
		}
	}

	const distinctLocationCandidates = unique(
		currentLocationCandidates.map((candidate) => candidate.value),
	);
	if (distinctLocationCandidates.length > 1) {
		gaps.push(
			`Campaign sources contain contradictory current location candidates: ${distinctLocationCandidates.join(", ")}.`,
		);
	}

	return {
		entities: {
			characters: unique(characters),
			locations: unique(locations),
			quests: unique(quests),
			factions: unique(factions),
			recentEvents: unique(recentEvents),
			facts: unique(facts),
			clocks: unique(clocks),
		},
		currentLocationCandidates,
		uncertainties: unique(uncertainties),
		gaps,
		factsRevealed: unique(factsRevealed),
		factionConsequences: unique(factionConsequences),
		npcAttitudes,
		clockProgress: unique(clockProgress),
	};
}

function inferLocationCandidates(
	line: string,
	source: string,
): Candidate[] {
	const candidates: Candidate[] = [];
	const arrived = /\b(?:reached|arrived at|now in|currently in)\s+([A-Z][A-Za-z' -]{1,40}?)(?:[.,;]| by\b| after\b| before\b|$)/g;
	const departed = /\b(?:left|from)\s+([A-Z][A-Za-z' -]{1,40}?)(?:[.,;]| by\b| after\b| before\b|$)/g;
	for (const match of line.matchAll(arrived)) {
		const value = normalizeEntity(match[1]);
		if (value) {
			candidates.push({ value, strength: 3, source });
		}
	}
	for (const match of line.matchAll(departed)) {
		const value = normalizeEntity(match[1]);
		if (value) {
			candidates.push({ value, strength: 1, source });
		}
	}
	return candidates;
}

function inferReferencedLocations(line: string): string[] {
	const locations: string[] = [];
	const nearby =
		/\b(?:near|toward|towards|outside|inside|within)\s+([A-Z][A-Za-z' -]{1,40}?)(?:[.,;]| by\b| after\b| before\b|$)/g;
	for (const match of line.matchAll(nearby)) {
		const value = normalizeEntity(match[1]);
		if (value) {
			locations.push(value);
		}
	}
	return locations;
}

function parsePrefixedValue(line: string, prefixes: string[]): string | null {
	for (const prefix of prefixes) {
		if (!line.toLowerCase().startsWith(prefix.toLowerCase())) {
			continue;
		}
		const value = normalizeEntity(line.slice(prefix.length));
		return value.length > 0 ? value : null;
	}
	return null;
}

function parsePrefixedText(line: string, prefixes: string[]): string | null {
	for (const prefix of prefixes) {
		if (!line.toLowerCase().startsWith(prefix.toLowerCase())) {
			continue;
		}
		const value = normalizeFreeformValue(line.slice(prefix.length));
		return value.length > 0 ? value : null;
	}
	return null;
}

function parseNpcAttitude(
	line: string,
): { name: string; attitude: string } | null {
	const value = parsePrefixedValue(line, ["NPC attitude:"]);
	if (!value) {
		return null;
	}
	const match = value.match(/^([^:=->]+?)\s*(?:->|=|:)\s*(.+)$/);
	if (!match) {
		return null;
	}
	const name = normalizeEntity(match[1]);
	const attitude = normalizeFreeformValue(match[2]);
	if (!name || !attitude) {
		return null;
	}
	return { name, attitude };
}

function inferClockName(value: string): string | null {
	const match = value.match(/^([^.:]+?clock)/i);
	return match ? normalizeEntity(match[1]) : null;
}

function deriveCurrentState(extracted: ExtractedCampaignData): CurrentStateModel {
	const rankedLocations = [...extracted.currentLocationCandidates].sort((left, right) =>
		right.strength - left.strength,
	);
	const currentLocation = rankedLocations[0]?.value ?? null;
	const uncertainties = [...extracted.uncertainties];
	if (rankedLocations.length > 1) {
		uncertainties.push(
			`Current location remains disputed between ${unique(rankedLocations.map((candidate) => candidate.value)).join(", ")}.`,
		);
	}
	if (!currentLocation) {
		uncertainties.push(
			"Current location is not yet confirmed from campaign sources.",
		);
	}

	return {
		currentLocation,
		activeQuests: extracted.entities.quests,
		relevantFactions: extracted.entities.factions,
		recentEvents: extracted.entities.recentEvents,
		uncertainties: unique(uncertainties),
		factsRevealed: extracted.factsRevealed,
		factionConsequences: extracted.factionConsequences,
		npcAttitudes: extracted.npcAttitudes,
		clockProgress: extracted.clockProgress,
		resourcesSpent: [],
		damageTaken: [],
		activeCorrections: [],
	};
}

function deriveTrackingProfile(
	entities: EntityIndex,
	currentState: CurrentStateModel,
): TrackingProfile {
	const strong = ["currentLocation", "activeQuests", "recentEvents"];
	if (entities.factions.length > 0) {
		strong.push("factionConsequences");
	}
	if (entities.clocks.length > 0) {
		strong.push("clockProgress");
	}
	if (currentState.uncertainties.length > 0) {
		strong.push("openUncertainties");
	}
	return {
		strong,
		light: ["npcContinuity", "travelPressure", "rumorThreads"],
		onDemand: ["minorLore", "sceneFlavor", "inventoryColor"],
	};
}

function deriveReadinessGaps(
	extracted: ExtractedCampaignData,
	currentState: CurrentStateModel,
): string[] {
	const gaps = [...extracted.gaps];
	if (!currentState.currentLocation) {
		gaps.push("Current location is missing from campaign sources.");
	}
	if (extracted.entities.quests.length === 0) {
		gaps.push("No active quest could be identified from campaign sources.");
	}
	return unique(gaps);
}

function normalizeEntity(value: string | undefined): string {
	return (value ?? "").trim().replace(/\s+/g, " ").replace(/[.]+$/, "");
}

function normalizeFreeformValue(value: string | undefined): string {
	return (value ?? "").trim().replace(/\s+/g, " ");
}

function stripTrailingContext(value: string): string {
	return value.replace(/\s+(?:want|wants|need|needs|is|are)\b.*$/i, "").trim();
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
	);
}

async function ensureJsonFile(filePath: string, value: unknown): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}
