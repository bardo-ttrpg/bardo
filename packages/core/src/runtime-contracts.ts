import { createHash, randomUUID } from "node:crypto";

export const RUNTIME_SCHEMA_VERSION = 2;

export const RUNTIME_ARTIFACT_PATHS = {
	conflicts: "manifests/conflicts.json",
	diagnostics: "manifests/diagnostics.json",
	turnTrace: "logs/turn-trace.ndjson",
	snapshotsDirectory: "snapshots",
	snapshotIndex: "snapshots/index.json",
	latestSnapshot: "snapshots/latest.json",
} as const;

export const RUNTIME_STORED_EVENT_TYPES = [
	"bootstrap",
	"player_action",
	"world_sync",
	"simulation_tick",
	"user_correction",
] as const;

export type RuntimeStoredEventType =
	(typeof RUNTIME_STORED_EVENT_TYPES)[number];

export const RUNTIME_VALIDATION_CODES = [
	"no_changes_proposed",
	"unknown_location",
	"unknown_quest",
	"unknown_faction",
	"unknown_recent_event",
	"unknown_fact",
	"unknown_character",
	"unknown_clock",
	"unknown_consequence_faction",
	"explicit_correction_conflict",
	"duplicate_entity_id",
	"ambiguous_entity_alias",
	"broken_location_reference",
	"broken_quest_reference",
	"broken_faction_reference",
	"broken_clock_reference",
	"broken_faction_pressure_reference",
	"invalid_time_regression",
	"invalid_clock_transition",
	"orphaned_consequence",
	"invalid_schema_version",
] as const;

export type RuntimeValidationCode = (typeof RUNTIME_VALIDATION_CODES)[number];

export type RuntimeValidationIssue = {
	code: RuntimeValidationCode;
	fieldName: string | null;
	message: string;
	conflictId: string | null;
};

export type ConfidenceClass =
	| "confirmed"
	| "validated-derived"
	| "probable"
	| "unresolved";

type EntityKind =
	| "character"
	| "location"
	| "quest"
	| "faction"
	| "recent-event"
	| "fact"
	| "clock";

export type EntityRecord = {
	id: string;
	name: string;
	aliases: string[];
	sourcePaths: string[];
};

export type EntityCatalog = {
	characters: EntityRecord[];
	locations: EntityRecord[];
	quests: EntityRecord[];
	factions: EntityRecord[];
	recentEvents: EntityRecord[];
	facts: EntityRecord[];
	clocks: EntityRecord[];
};

export type WorldClockState = {
	id: string;
	name: string;
	progress: string;
	confidence: ConfidenceClass;
	deadlineISO: string | null;
};

export type ConsequenceRecord = {
	id: string;
	description: string;
	factionId: string | null;
	status: "open" | "resolved";
};

export type FieldMetadataEntry = {
	entityId: string | null;
	confidence: ConfidenceClass;
	provenance: {
		sourceType: string;
		sourcePath: string | null;
		sourceLocator: string | null;
		eventId: string | null;
		actor: string | null;
		correctionEventId: string | null;
		updatedAtISO: string | null;
	};
};

export type RuntimeCurrentState = {
	schemaVersion: number;
	currentLocation: string | null;
	activeQuests: string[];
	relevantFactions: string[];
	recentEvents: string[];
	uncertainties: string[];
	factsRevealed: string[];
	resourcesSpent: string[];
	damageTaken: string[];
	factionConsequences: string[];
	npcAttitudes: Record<string, string>;
	clockProgress: string[];
	activeCorrections: string[];
	worldTime: {
		currentDateTimeISO: string | null;
		lastAdvancedByEventId: string | null;
	};
	activeClocks: WorldClockState[];
	unresolvedConsequences: string[];
	consequenceRecords: ConsequenceRecord[];
	factionPressure: Record<string, number>;
	revealStates: Record<string, "hidden" | "revealed">;
	correctionSupersededEventIds: string[];
	fieldMetadata: Record<string, FieldMetadataEntry>;
	updatedAtISO: string | null;
};

type RuntimeConflictRecord = {
	conflictId: string;
	fieldName: string;
	competingValues: string[];
	competingSources: string[];
	precedenceResult:
		| "blocked_by_higher_precedence"
		| "requires_user_resolution"
		| "invalid_state";
	resolutionStatus: "unresolved" | "resolved";
	userActionRequired: boolean;
	recordedAtISO: string;
};

type RuntimeConflictManifest = {
	schemaVersion: number;
	updatedAtISO: string | null;
	conflicts: RuntimeConflictRecord[];
};

export type RuntimeEventRecord = {
	schemaVersion: number;
	type: string;
	eventId: string;
	eventType: RuntimeStoredEventType;
	actorType: "runtime-tool" | "system-bootstrap";
	actorSource: string;
	atISO: string;
	causalParentEventId: string | null;
	affectedEntityIds: string[];
	summary: string;
	beforeAfterSummary: Record<string, unknown>;
	changes: Record<string, unknown>;
	validated: true;
	canonBasis: string;
	consultedArtifacts: string[];
	precedence: string[];
	conflictIds: string[];
	conflicts: string[];
	uncertainties: string[];
	stateHashBefore: string;
	stateHashAfter: string;
	correctionLinkage: {
		supersedesEventIds: string[];
	} | null;
};

type RuntimeSnapshotRecord = {
	schemaVersion: number;
	snapshotId: string;
	createdAtISO: string;
	reason: "bootstrap" | "commit" | "correction" | "migration";
	replayPosition: {
		eventId: string | null;
		eventIndex: number;
	};
	stateHash: string;
	integrityStatus: "valid";
	currentState: RuntimeCurrentState;
};

type RuntimeSnapshotIndexRecord = {
	snapshotId: string;
	path: string;
	createdAtISO: string;
	stateHash: string;
	reason: RuntimeSnapshotRecord["reason"];
	replayPosition: RuntimeSnapshotRecord["replayPosition"];
};

type RuntimeSnapshotIndexManifest = {
	schemaVersion: number;
	updatedAtISO: string | null;
	snapshots: RuntimeSnapshotIndexRecord[];
};

type RuntimeDiagnosticsManifest = {
	schemaVersion: number;
	updatedAtISO: string | null;
	readinessStatus: string | null;
	latestEventId: string | null;
	latestStateHash: string | null;
	latestSnapshotId: string | null;
	latestSnapshotPath: string | null;
	snapshotCount: number;
	recentEventIds: string[];
	activeConflictIds: string[];
	correctionEventIds: string[];
	integrity: {
		status: "valid";
		currentStateHash: string | null;
		eventLogHash: string | null;
		latestSnapshotHash: string | null;
	};
	replayStatus: {
		canReplayFromEventZero: boolean;
		canReplayFromLatestSnapshot: boolean;
		lastReplayMode: "events-only" | "latest-snapshot" | "from-event" | null;
	};
};

export type RuntimeTurnTraceRecord = {
	schemaVersion: number;
	traceId: string;
	toolName: string;
	atISO: string;
	consultedArtifacts: string[];
	relevantRules: string[];
	proposedChanges: Record<string, unknown>;
	precedenceDecisions: string[];
	validationIssues: RuntimeValidationIssue[];
	validationSummary: {
		status: "committed" | "blocked" | "conservative";
		blockedReasons: string[];
		conflictIds: string[];
		issueCodes: RuntimeValidationCode[];
	};
	commitResult: {
		eventId: string | null;
		stateHash: string | null;
	} | null;
};

type StateChanges = {
	currentLocation?: string | null;
	activeQuests?: string[];
	relevantFactions?: string[];
	recentEvents?: string[];
	uncertainties?: string[];
	factsRevealed?: string[];
	resourcesSpent?: string[];
	damageTaken?: string[];
	factionConsequences?: string[];
	npcAttitudes?: Record<string, string>;
	clockProgress?: string[];
	activeCorrections?: string[];
	removeFactsRevealed?: string[];
	removeRecentEvents?: string[];
	resolveConsequences?: string[];
};

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
	}
	const entries = Object.entries(value as Record<string, unknown>).sort(
		([left], [right]) => left.localeCompare(right),
	);
	return `{${entries
		.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
		.join(",")}}`;
}

export function computeStateHash(value: unknown): string {
	return createHash("sha256")
		.update(stableStringify(value), "utf8")
		.digest("hex");
}

export function createRuntimeEventId(): string {
	return `evt_${randomUUID().replaceAll("-", "")}`;
}

function createRuntimeSnapshotId(): string {
	return `snap_${randomUUID().replaceAll("-", "")}`;
}

export function createRuntimeTraceId(): string {
	return `trace_${randomUUID().replaceAll("-", "")}`;
}

export function createStableEntityId(kind: EntityKind, name: string): string {
	return `${kind}:${slugify(name)}`;
}

function slugify(value: string): string {
	let slug = "";
	let pendingSeparator = false;

	for (const character of value.toLowerCase().trim()) {
		const isAsciiLetter = character >= "a" && character <= "z";
		const isDigit = character >= "0" && character <= "9";

		if (isAsciiLetter || isDigit) {
			if (pendingSeparator && slug.length > 0) {
				slug += "-";
			}
			slug += character;
			pendingSeparator = false;
			continue;
		}

		pendingSeparator = slug.length > 0;
	}

	return slug;
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(
		new Set(
			values.map((value) => value.trim()).filter((value) => value.length > 0),
		),
	);
}

function normalizeEntityAlias(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? uniqueStrings(
				value.filter((entry): entry is string => typeof entry === "string"),
			)
		: [];
}

function toStringRecord(value: unknown): Record<string, string> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return {};
	}
	return Object.fromEntries(
		Object.entries(value)
			.filter(([, entry]) => typeof entry === "string")
			.map(([key, entry]) => [key.trim(), (entry as string).trim()]),
	);
}

export function createFieldMetadataEntry(args: {
	entityId?: string | null;
	confidence: ConfidenceClass;
	sourceType: string;
	sourcePath?: string | null;
	sourceLocator?: string | null;
	eventId?: string | null;
	actor?: string | null;
	correctionEventId?: string | null;
	updatedAtISO?: string | null;
}): FieldMetadataEntry {
	return {
		entityId: args.entityId ?? null,
		confidence: args.confidence,
		provenance: {
			sourceType: args.sourceType,
			sourcePath: args.sourcePath ?? null,
			sourceLocator: args.sourceLocator ?? null,
			eventId: args.eventId ?? null,
			actor: args.actor ?? null,
			correctionEventId: args.correctionEventId ?? null,
			updatedAtISO: args.updatedAtISO ?? null,
		},
	};
}

export function createEntityCatalog(args: {
	characters: string[];
	locations: string[];
	quests: string[];
	factions: string[];
	recentEvents: string[];
	facts: string[];
	clocks: string[];
	sourcePaths?: Partial<Record<keyof EntityCatalog, Record<string, string[]>>>;
}): EntityCatalog {
	return {
		characters: createEntityRecords(
			"character",
			args.characters,
			args.sourcePaths?.characters,
		),
		locations: createEntityRecords(
			"location",
			args.locations,
			args.sourcePaths?.locations,
		),
		quests: createEntityRecords("quest", args.quests, args.sourcePaths?.quests),
		factions: createEntityRecords(
			"faction",
			args.factions,
			args.sourcePaths?.factions,
		),
		recentEvents: createEntityRecords(
			"recent-event",
			args.recentEvents,
			args.sourcePaths?.recentEvents,
		),
		facts: createEntityRecords("fact", args.facts, args.sourcePaths?.facts),
		clocks: createEntityRecords("clock", args.clocks, args.sourcePaths?.clocks),
	};
}

function createEntityRecords(
	kind: EntityKind,
	values: string[],
	sourcePaths: Record<string, string[]> | undefined,
): EntityRecord[] {
	return uniqueStrings(values).map((value) => ({
		id: createStableEntityId(kind, value),
		name: value,
		aliases: [value],
		sourcePaths: sourcePaths?.[value] ?? [],
	}));
}

export function normalizeEntityCatalog(
	raw: Partial<EntityCatalog> & {
		records?: Partial<EntityCatalog>;
	},
): EntityCatalog {
	const records = raw.records ?? raw;
	return {
		characters: normalizeEntityRecords(
			records.characters,
			toStringArray(raw.characters),
			"character",
		),
		locations: normalizeEntityRecords(
			records.locations,
			toStringArray(raw.locations),
			"location",
		),
		quests: normalizeEntityRecords(
			records.quests,
			toStringArray(raw.quests),
			"quest",
		),
		factions: normalizeEntityRecords(
			records.factions,
			toStringArray(raw.factions),
			"faction",
		),
		recentEvents: normalizeEntityRecords(
			records.recentEvents,
			toStringArray(raw.recentEvents),
			"recent-event",
		),
		facts: normalizeEntityRecords(
			records.facts,
			toStringArray(raw.facts),
			"fact",
		),
		clocks: normalizeEntityRecords(
			records.clocks,
			toStringArray(raw.clocks),
			"clock",
		),
	};
}

function normalizeEntityRecords(
	value: unknown,
	fallback: string[],
	kind: EntityKind,
): EntityRecord[] {
	if (!Array.isArray(value)) {
		return createEntityRecords(kind, fallback, undefined);
	}

	const normalized = value
		.map((entry) => {
			if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
				return null;
			}
			const record = entry as Record<string, unknown>;
			const name =
				typeof record.name === "string" && record.name.trim().length > 0
					? record.name.trim()
					: null;
			if (!name) {
				return null;
			}
			const id =
				typeof record.id === "string" && record.id.trim().length > 0
					? record.id.trim()
					: createStableEntityId(kind, name);
			return {
				id,
				name,
				aliases: toStringArray(record.aliases).length
					? toStringArray(record.aliases)
					: [name],
				sourcePaths: toStringArray(record.sourcePaths),
			} satisfies EntityRecord;
		})
		.filter((entry): entry is EntityRecord => entry !== null);

	if (normalized.length > 0) {
		return normalized;
	}

	return createEntityRecords(kind, fallback, undefined);
}

export function findEntityId(
	catalog: EntityCatalog,
	kind: keyof EntityCatalog,
	name: string | null | undefined,
): string | null {
	if (!name) {
		return null;
	}
	const normalizedName = name.trim().toLowerCase();
	return (
		catalog[kind].find(
			(entry) =>
				entry.name.toLowerCase() === normalizedName ||
				entry.aliases.some((alias) => alias.toLowerCase() === normalizedName),
		)?.id ?? null
	);
}

export function buildWorldClockStates(args: {
	clockProgress: string[];
	catalog: EntityCatalog;
}): WorldClockState[] {
	return uniqueStrings(args.clockProgress).map((progress) => {
		const matched = args.catalog.clocks.find((clock) =>
			progress.toLowerCase().includes(clock.name.toLowerCase()),
		);
		const name = matched?.name ?? inferClockName(progress) ?? progress;
		return {
			id: matched?.id ?? createStableEntityId("clock", name),
			name,
			progress,
			confidence: "validated-derived",
			deadlineISO: null,
		};
	});
}

export function buildFactionPressure(args: {
	factions: string[];
	consequences: string[];
	catalog: EntityCatalog;
}): Record<string, number> {
	const pressure: Record<string, number> = {};
	for (const faction of uniqueStrings(args.factions)) {
		const factionId =
			findEntityId(args.catalog, "factions", faction) ??
			createStableEntityId("faction", faction);
		pressure[factionId] = 0;
	}
	for (const consequence of uniqueStrings(args.consequences)) {
		for (const faction of args.catalog.factions) {
			if (consequence.toLowerCase().includes(faction.name.toLowerCase())) {
				pressure[faction.id] = (pressure[faction.id] ?? 0) + 1;
			}
		}
	}
	return pressure;
}

function buildConsequenceRecords(args: {
	consequences: string[];
	catalog: EntityCatalog;
}): ConsequenceRecord[] {
	return uniqueStrings(args.consequences).map((consequence) => {
		const factionMatch =
			args.catalog.factions.find((entry) =>
				consequence.toLowerCase().includes(entry.name.toLowerCase()),
			) ?? null;
		return {
			id: `consequence:${computeStateHash(consequence).slice(0, 12)}`,
			description: consequence,
			factionId: factionMatch?.id ?? null,
			status: "open",
		};
	});
}

function buildRevealStates(
	factsRevealed: string[],
): Record<string, "hidden" | "revealed"> {
	return Object.fromEntries(
		uniqueStrings(factsRevealed).map((fact) => [fact, "revealed" as const]),
	);
}

function inferClockName(progress: string): string | null {
	const match = progress.match(/^([^.:]+?clock)/i);
	return match?.[1] ? match[1].trim() : null;
}

export function createBlankCurrentState(
	nowIso: string | null,
): RuntimeCurrentState {
	return {
		schemaVersion: RUNTIME_SCHEMA_VERSION,
		currentLocation: null,
		activeQuests: [],
		relevantFactions: [],
		recentEvents: [],
		uncertainties: [],
		factsRevealed: [],
		resourcesSpent: [],
		damageTaken: [],
		factionConsequences: [],
		npcAttitudes: {},
		clockProgress: [],
		activeCorrections: [],
		worldTime: {
			currentDateTimeISO: nowIso,
			lastAdvancedByEventId: null,
		},
		activeClocks: [],
		unresolvedConsequences: [],
		consequenceRecords: [],
		factionPressure: {},
		revealStates: {},
		correctionSupersededEventIds: [],
		fieldMetadata: {},
		updatedAtISO: nowIso,
	};
}

export function normalizeCurrentState(
	raw: Partial<RuntimeCurrentState>,
	args: {
		nowIso?: string | null;
		catalog?: EntityCatalog | null;
	} = {},
): RuntimeCurrentState {
	const currentLocation =
		typeof raw.currentLocation === "string" || raw.currentLocation === null
			? (raw.currentLocation ?? null)
			: null;
	const activeQuests = toStringArray(raw.activeQuests);
	const relevantFactions = toStringArray(raw.relevantFactions);
	const factionConsequences = toStringArray(raw.factionConsequences);
	const clockProgress = toStringArray(raw.clockProgress);
	const catalog = args.catalog ?? null;
	const worldTime =
		typeof raw.worldTime === "object" && raw.worldTime !== null
			? {
					currentDateTimeISO:
						typeof raw.worldTime.currentDateTimeISO === "string" ||
						raw.worldTime.currentDateTimeISO === null
							? raw.worldTime.currentDateTimeISO
							: (args.nowIso ?? null),
					lastAdvancedByEventId:
						typeof raw.worldTime.lastAdvancedByEventId === "string" ||
						raw.worldTime.lastAdvancedByEventId === null
							? raw.worldTime.lastAdvancedByEventId
							: null,
				}
			: {
					currentDateTimeISO: args.nowIso ?? null,
					lastAdvancedByEventId: null,
				};
	const fieldMetadata = normalizeFieldMetadata(raw.fieldMetadata);
	if (currentLocation && !fieldMetadata.currentLocation) {
		fieldMetadata.currentLocation = createFieldMetadataEntry({
			entityId: catalog
				? findEntityId(catalog, "locations", currentLocation)
				: null,
			confidence: "confirmed",
			sourceType: "campaign-file",
			sourcePath: null,
			updatedAtISO: args.nowIso ?? null,
		});
	}

	return {
		schemaVersion: RUNTIME_SCHEMA_VERSION,
		currentLocation,
		activeQuests,
		relevantFactions,
		recentEvents: toStringArray(raw.recentEvents),
		uncertainties: toStringArray(raw.uncertainties),
		factsRevealed: toStringArray(raw.factsRevealed),
		resourcesSpent: toStringArray(raw.resourcesSpent),
		damageTaken: toStringArray(raw.damageTaken),
		factionConsequences,
		npcAttitudes: toStringRecord(raw.npcAttitudes),
		clockProgress,
		activeCorrections: toStringArray(raw.activeCorrections),
		worldTime,
		activeClocks:
			Array.isArray(raw.activeClocks) && raw.activeClocks.length > 0
				? raw.activeClocks
						.map((entry) => normalizeWorldClockState(entry))
						.filter((entry): entry is WorldClockState => entry !== null)
				: buildWorldClockStates({
						clockProgress,
						catalog: catalog ?? createEntityCatalogFromCurrentState(raw),
					}),
		unresolvedConsequences:
			toStringArray(raw.unresolvedConsequences).length > 0
				? toStringArray(raw.unresolvedConsequences)
				: factionConsequences,
		consequenceRecords:
			Array.isArray(raw.consequenceRecords) && raw.consequenceRecords.length > 0
				? raw.consequenceRecords
						.map((entry) => normalizeConsequenceRecord(entry))
						.filter((entry): entry is ConsequenceRecord => entry !== null)
				: buildConsequenceRecords({
						consequences:
							toStringArray(raw.unresolvedConsequences).length > 0
								? toStringArray(raw.unresolvedConsequences)
								: factionConsequences,
						catalog: catalog ?? createEntityCatalogFromCurrentState(raw),
					}),
		factionPressure:
			typeof raw.factionPressure === "object" &&
			raw.factionPressure !== null &&
			!Array.isArray(raw.factionPressure)
				? Object.fromEntries(
						Object.entries(raw.factionPressure)
							.filter(([, entry]) => typeof entry === "number")
							.map(([key, entry]) => [key.trim(), entry as number]),
					)
				: buildFactionPressure({
						factions: relevantFactions,
						consequences: factionConsequences,
						catalog: catalog ?? createEntityCatalogFromCurrentState(raw),
					}),
		revealStates:
			typeof raw.revealStates === "object" &&
			raw.revealStates !== null &&
			!Array.isArray(raw.revealStates)
				? Object.fromEntries(
						Object.entries(raw.revealStates)
							.filter(([, entry]) => entry === "hidden" || entry === "revealed")
							.map(([key, entry]) => [
								key.trim(),
								entry as "hidden" | "revealed",
							]),
					)
				: buildRevealStates(toStringArray(raw.factsRevealed)),
		correctionSupersededEventIds: toStringArray(
			raw.correctionSupersededEventIds,
		),
		fieldMetadata,
		updatedAtISO:
			typeof raw.updatedAtISO === "string" || raw.updatedAtISO === null
				? (raw.updatedAtISO ?? args.nowIso ?? null)
				: (args.nowIso ?? null),
	};
}

function createEntityCatalogFromCurrentState(
	raw: Partial<RuntimeCurrentState>,
): EntityCatalog {
	return createEntityCatalog({
		characters: Object.keys(toStringRecord(raw.npcAttitudes)),
		locations:
			typeof raw.currentLocation === "string" ? [raw.currentLocation] : [],
		quests: toStringArray(raw.activeQuests),
		factions: toStringArray(raw.relevantFactions),
		recentEvents: toStringArray(raw.recentEvents),
		facts: toStringArray(raw.factsRevealed),
		clocks: toStringArray(raw.clockProgress).map(
			(progress) => inferClockName(progress) ?? progress,
		),
	});
}

function normalizeFieldMetadata(
	value: unknown,
): Record<string, FieldMetadataEntry> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return {};
	}
	const entries = Object.entries(value as Record<string, unknown>)
		.map(([key, entry]) => {
			if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
				return null;
			}
			const record = entry as Record<string, unknown>;
			const provenance =
				typeof record.provenance === "object" &&
				record.provenance !== null &&
				!Array.isArray(record.provenance)
					? (record.provenance as Record<string, unknown>)
					: {};
			return [
				key,
				{
					entityId:
						typeof record.entityId === "string" || record.entityId === null
							? (record.entityId ?? null)
							: null,
					confidence:
						record.confidence === "confirmed" ||
						record.confidence === "validated-derived" ||
						record.confidence === "probable" ||
						record.confidence === "unresolved"
							? record.confidence
							: "unresolved",
					provenance: {
						sourceType:
							typeof provenance.sourceType === "string"
								? provenance.sourceType
								: "unknown",
						sourcePath:
							typeof provenance.sourcePath === "string" ||
							provenance.sourcePath === null
								? (provenance.sourcePath ?? null)
								: null,
						sourceLocator:
							typeof provenance.sourceLocator === "string" ||
							provenance.sourceLocator === null
								? (provenance.sourceLocator ?? null)
								: null,
						eventId:
							typeof provenance.eventId === "string" ||
							provenance.eventId === null
								? (provenance.eventId ?? null)
								: null,
						actor:
							typeof provenance.actor === "string" || provenance.actor === null
								? (provenance.actor ?? null)
								: null,
						correctionEventId:
							typeof provenance.correctionEventId === "string" ||
							provenance.correctionEventId === null
								? (provenance.correctionEventId ?? null)
								: null,
						updatedAtISO:
							typeof provenance.updatedAtISO === "string" ||
							provenance.updatedAtISO === null
								? (provenance.updatedAtISO ?? null)
								: null,
					},
				} satisfies FieldMetadataEntry,
			] as const;
		})
		.filter(
			(entry): entry is readonly [string, FieldMetadataEntry] => entry !== null,
		);
	return Object.fromEntries(entries);
}

function normalizeWorldClockState(value: unknown): WorldClockState | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const entry = value as Record<string, unknown>;
	const name =
		typeof entry.name === "string" && entry.name.trim().length > 0
			? entry.name.trim()
			: null;
	const progress =
		typeof entry.progress === "string" && entry.progress.trim().length > 0
			? entry.progress.trim()
			: null;
	if (!name || !progress) {
		return null;
	}
	return {
		id:
			typeof entry.id === "string" && entry.id.trim().length > 0
				? entry.id.trim()
				: createStableEntityId("clock", name),
		name,
		progress,
		confidence:
			entry.confidence === "confirmed" ||
			entry.confidence === "validated-derived" ||
			entry.confidence === "probable" ||
			entry.confidence === "unresolved"
				? entry.confidence
				: "validated-derived",
		deadlineISO:
			typeof entry.deadlineISO === "string" || entry.deadlineISO === null
				? (entry.deadlineISO ?? null)
				: null,
	};
}

function normalizeConsequenceRecord(value: unknown): ConsequenceRecord | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const entry = value as Record<string, unknown>;
	const description =
		typeof entry.description === "string" && entry.description.trim().length > 0
			? entry.description.trim()
			: null;
	if (!description) {
		return null;
	}
	return {
		id:
			typeof entry.id === "string" && entry.id.trim().length > 0
				? entry.id.trim()
				: `consequence:${computeStateHash(description).slice(0, 12)}`,
		description,
		factionId:
			typeof entry.factionId === "string" || entry.factionId === null
				? (entry.factionId ?? null)
				: null,
		status: entry.status === "resolved" ? "resolved" : "open",
	};
}

export function applyStateChanges(args: {
	currentState: RuntimeCurrentState;
	changes: StateChanges;
	nowIso: string;
	eventId: string | null;
	catalog: EntityCatalog;
	sourceType: string;
	sourcePath?: string | null;
	sourceLocator?: string | null;
	actor?: string | null;
	correctionEventId?: string | null;
}): RuntimeCurrentState {
	const nextState = normalizeCurrentState(
		{
			...args.currentState,
			currentLocation:
				args.changes.currentLocation !== undefined
					? args.changes.currentLocation
					: args.currentState.currentLocation,
			activeQuests:
				args.changes.activeQuests ?? args.currentState.activeQuests ?? [],
			relevantFactions:
				args.changes.relevantFactions ??
				args.currentState.relevantFactions ??
				[],
			recentEvents: uniqueStrings([
				...args.currentState.recentEvents,
				...(args.changes.recentEvents ?? []),
			]).filter(
				(value) => !(args.changes.removeRecentEvents ?? []).includes(value),
			),
			factsRevealed: uniqueStrings([
				...args.currentState.factsRevealed,
				...(args.changes.factsRevealed ?? []),
			]).filter(
				(value) => !(args.changes.removeFactsRevealed ?? []).includes(value),
			),
			resourcesSpent: uniqueStrings([
				...args.currentState.resourcesSpent,
				...(args.changes.resourcesSpent ?? []),
			]),
			damageTaken: uniqueStrings([
				...args.currentState.damageTaken,
				...(args.changes.damageTaken ?? []),
			]),
			factionConsequences: uniqueStrings([
				...args.currentState.factionConsequences,
				...(args.changes.factionConsequences ?? []),
			]),
			npcAttitudes: {
				...args.currentState.npcAttitudes,
				...(args.changes.npcAttitudes ?? {}),
			},
			clockProgress: uniqueStrings([
				...args.currentState.clockProgress,
				...(args.changes.clockProgress ?? []),
			]),
			activeCorrections: uniqueStrings([
				...args.currentState.activeCorrections,
				...(args.changes.activeCorrections ?? []),
			]),
			uncertainties:
				args.changes.uncertainties ?? args.currentState.uncertainties ?? [],
			worldTime: {
				currentDateTimeISO: args.nowIso,
				lastAdvancedByEventId: args.eventId,
			},
			updatedAtISO: args.nowIso,
		},
		{
			nowIso: args.nowIso,
			catalog: args.catalog,
		},
	);

	if (args.changes.currentLocation !== undefined) {
		nextState.fieldMetadata.currentLocation = createFieldMetadataEntry({
			entityId: findEntityId(
				args.catalog,
				"locations",
				args.changes.currentLocation,
			),
			confidence:
				args.sourceType === "validated-event"
					? "validated-derived"
					: "confirmed",
			sourceType: args.sourceType,
			sourcePath: args.sourcePath ?? null,
			sourceLocator: args.sourceLocator ?? null,
			eventId: args.eventId,
			actor: args.actor ?? null,
			correctionEventId: args.correctionEventId ?? null,
			updatedAtISO: args.nowIso,
		});
	}

	if (args.changes.activeQuests !== undefined) {
		nextState.fieldMetadata.activeQuests = createFieldMetadataEntry({
			entityId: args.changes.activeQuests[0]
				? findEntityId(args.catalog, "quests", args.changes.activeQuests[0])
				: null,
			confidence: "validated-derived",
			sourceType: args.sourceType,
			sourcePath: args.sourcePath ?? null,
			sourceLocator: args.sourceLocator ?? null,
			eventId: args.eventId,
			actor: args.actor ?? null,
			correctionEventId: args.correctionEventId ?? null,
			updatedAtISO: args.nowIso,
		});
	}

	if (args.changes.relevantFactions !== undefined) {
		nextState.fieldMetadata.relevantFactions = createFieldMetadataEntry({
			entityId: args.changes.relevantFactions[0]
				? findEntityId(
						args.catalog,
						"factions",
						args.changes.relevantFactions[0],
					)
				: null,
			confidence: "validated-derived",
			sourceType: args.sourceType,
			sourcePath: args.sourcePath ?? null,
			sourceLocator: args.sourceLocator ?? null,
			eventId: args.eventId,
			actor: args.actor ?? null,
			correctionEventId: args.correctionEventId ?? null,
			updatedAtISO: args.nowIso,
		});
	}

	if (args.changes.factionConsequences !== undefined) {
		nextState.fieldMetadata.factionConsequences = createFieldMetadataEntry({
			entityId: args.changes.relevantFactions?.[0]
				? findEntityId(
						args.catalog,
						"factions",
						args.changes.relevantFactions[0],
					)
				: null,
			confidence: "validated-derived",
			sourceType: args.sourceType,
			sourcePath: args.sourcePath ?? null,
			sourceLocator: args.sourceLocator ?? null,
			eventId: args.eventId,
			actor: args.actor ?? null,
			correctionEventId: args.correctionEventId ?? null,
			updatedAtISO: args.nowIso,
		});
	}

	if (args.changes.clockProgress !== undefined) {
		nextState.fieldMetadata.clockProgress = createFieldMetadataEntry({
			entityId: args.changes.clockProgress[0]
				? (args.catalog.clocks.find((clock) =>
						args.changes.clockProgress?.[0]
							?.toLowerCase()
							.includes(clock.name.toLowerCase()),
					)?.id ?? null)
				: null,
			confidence: "validated-derived",
			sourceType: args.sourceType,
			sourcePath: args.sourcePath ?? null,
			sourceLocator: args.sourceLocator ?? null,
			eventId: args.eventId,
			actor: args.actor ?? null,
			correctionEventId: args.correctionEventId ?? null,
			updatedAtISO: args.nowIso,
		});
	}

	if ((args.changes.activeCorrections?.length ?? 0) > 0 && args.eventId) {
		nextState.correctionSupersededEventIds = uniqueStrings([
			...nextState.correctionSupersededEventIds,
			args.eventId,
		]);
	}

	nextState.revealStates = buildRevealStates(nextState.factsRevealed);
	nextState.consequenceRecords = buildConsequenceRecords({
		consequences: nextState.unresolvedConsequences.filter(
			(consequence) =>
				!(args.changes.resolveConsequences ?? []).includes(consequence),
		),
		catalog: args.catalog,
	});
	nextState.unresolvedConsequences = nextState.consequenceRecords
		.filter((record) => record.status === "open")
		.map((record) => record.description);

	return normalizeCurrentState(nextState, {
		nowIso: args.nowIso,
		catalog: args.catalog,
	});
}

export function buildBeforeAfterSummary(args: {
	currentState: RuntimeCurrentState;
	nextState: RuntimeCurrentState;
}): Record<string, unknown> {
	const summary: Record<string, unknown> = {};
	for (const field of [
		"currentLocation",
		"activeQuests",
		"relevantFactions",
		"recentEvents",
		"factsRevealed",
		"factionConsequences",
		"clockProgress",
	] as const) {
		if (
			stableStringify(args.currentState[field]) !==
			stableStringify(args.nextState[field])
		) {
			summary[field] = {
				before: args.currentState[field],
				after: args.nextState[field],
			};
		}
	}
	return summary;
}

export function createConflictRecord(args: {
	fieldName: string;
	competingValues: string[];
	competingSources: string[];
	recordedAtISO: string;
	precedenceResult?: RuntimeConflictRecord["precedenceResult"];
}): RuntimeConflictRecord {
	const fingerprint = computeStateHash({
		fieldName: args.fieldName,
		competingValues: args.competingValues,
		competingSources: args.competingSources,
		recordedAtISO: args.recordedAtISO,
	});
	return {
		conflictId: `conflict_${fingerprint.slice(0, 12)}`,
		fieldName: args.fieldName,
		competingValues: uniqueStrings(args.competingValues),
		competingSources: uniqueStrings(args.competingSources),
		precedenceResult: args.precedenceResult ?? "requires_user_resolution",
		resolutionStatus: "unresolved",
		userActionRequired: true,
		recordedAtISO: args.recordedAtISO,
	};
}

export function normalizeConflictManifest(
	raw: Partial<RuntimeConflictManifest>,
): RuntimeConflictManifest {
	return {
		schemaVersion: RUNTIME_SCHEMA_VERSION,
		updatedAtISO:
			typeof raw.updatedAtISO === "string" || raw.updatedAtISO === null
				? (raw.updatedAtISO ?? null)
				: null,
		conflicts: Array.isArray(raw.conflicts)
			? raw.conflicts.filter(
					(entry): entry is RuntimeConflictRecord =>
						typeof entry === "object" &&
						entry !== null &&
						typeof entry.conflictId === "string" &&
						typeof entry.fieldName === "string" &&
						(entry.precedenceResult === "blocked_by_higher_precedence" ||
							entry.precedenceResult === "requires_user_resolution" ||
							entry.precedenceResult === "invalid_state"),
				)
			: [],
	};
}

export function createSnapshotRecord(args: {
	currentState: RuntimeCurrentState;
	stateHash: string;
	createdAtISO: string;
	eventId: string | null;
	eventIndex: number;
	reason: RuntimeSnapshotRecord["reason"];
}): RuntimeSnapshotRecord {
	return {
		schemaVersion: RUNTIME_SCHEMA_VERSION,
		snapshotId: createRuntimeSnapshotId(),
		createdAtISO: args.createdAtISO,
		reason: args.reason,
		replayPosition: {
			eventId: args.eventId,
			eventIndex: args.eventIndex,
		},
		stateHash: args.stateHash,
		integrityStatus: "valid",
		currentState: args.currentState,
	};
}

export function normalizeSnapshotRecord(
	raw: Partial<RuntimeSnapshotRecord>,
): RuntimeSnapshotRecord {
	return {
		schemaVersion: validateSchemaVersion(raw.schemaVersion),
		snapshotId:
			typeof raw.snapshotId === "string" && raw.snapshotId.trim().length > 0
				? raw.snapshotId
				: createRuntimeSnapshotId(),
		createdAtISO:
			typeof raw.createdAtISO === "string"
				? raw.createdAtISO
				: new Date(0).toISOString(),
		reason:
			raw.reason === "bootstrap" ||
			raw.reason === "commit" ||
			raw.reason === "correction" ||
			raw.reason === "migration"
				? raw.reason
				: "commit",
		replayPosition: {
			eventId:
				typeof raw.replayPosition?.eventId === "string" ||
				raw.replayPosition?.eventId === null
					? (raw.replayPosition?.eventId ?? null)
					: null,
			eventIndex:
				typeof raw.replayPosition?.eventIndex === "number"
					? raw.replayPosition.eventIndex
					: 0,
		},
		stateHash: typeof raw.stateHash === "string" ? raw.stateHash : "",
		integrityStatus: "valid",
		currentState: normalizeCurrentState(raw.currentState ?? {}, {
			nowIso: raw.createdAtISO ?? null,
			catalog: null,
		}),
	};
}

export function normalizeSnapshotIndexManifest(
	raw: Partial<RuntimeSnapshotIndexManifest>,
): RuntimeSnapshotIndexManifest {
	return {
		schemaVersion: validateSchemaVersion(raw.schemaVersion, {
			allowMissing: true,
		}),
		updatedAtISO:
			typeof raw.updatedAtISO === "string" || raw.updatedAtISO === null
				? (raw.updatedAtISO ?? null)
				: null,
		snapshots: Array.isArray(raw.snapshots)
			? raw.snapshots.filter(
					(entry): entry is RuntimeSnapshotIndexRecord =>
						typeof entry === "object" &&
						entry !== null &&
						typeof entry.snapshotId === "string" &&
						typeof entry.path === "string" &&
						typeof entry.stateHash === "string" &&
						(entry.reason === "bootstrap" ||
							entry.reason === "commit" ||
							entry.reason === "correction" ||
							entry.reason === "migration"),
				)
			: [],
	};
}

export function createDiagnosticsManifest(args: {
	updatedAtISO: string;
	readinessStatus?: string | null;
	latestEventId: string | null;
	latestStateHash: string | null;
	latestSnapshotId: string | null;
	latestSnapshotPath: string | null;
	snapshotCount: number;
	activeConflictIds: string[];
	recentEventIds: string[];
	correctionEventIds: string[];
	integrity: RuntimeDiagnosticsManifest["integrity"];
	replayStatus?: RuntimeDiagnosticsManifest["replayStatus"];
}): RuntimeDiagnosticsManifest {
	return {
		schemaVersion: RUNTIME_SCHEMA_VERSION,
		updatedAtISO: args.updatedAtISO,
		readinessStatus: args.readinessStatus ?? null,
		latestEventId: args.latestEventId,
		latestStateHash: args.latestStateHash,
		latestSnapshotId: args.latestSnapshotId,
		latestSnapshotPath: args.latestSnapshotPath,
		snapshotCount: args.snapshotCount,
		activeConflictIds: uniqueStrings(args.activeConflictIds),
		recentEventIds: uniqueStrings(args.recentEventIds),
		correctionEventIds: uniqueStrings(args.correctionEventIds),
		integrity: args.integrity,
		replayStatus: args.replayStatus ?? {
			canReplayFromEventZero: true,
			canReplayFromLatestSnapshot: args.latestSnapshotId !== null,
			lastReplayMode: null,
		},
	};
}

export function normalizeDiagnosticsManifest(
	raw: Partial<RuntimeDiagnosticsManifest>,
): RuntimeDiagnosticsManifest {
	return {
		schemaVersion: validateSchemaVersion(raw.schemaVersion),
		updatedAtISO:
			typeof raw.updatedAtISO === "string" || raw.updatedAtISO === null
				? (raw.updatedAtISO ?? null)
				: null,
		readinessStatus:
			typeof raw.readinessStatus === "string" || raw.readinessStatus === null
				? (raw.readinessStatus ?? null)
				: null,
		latestEventId:
			typeof raw.latestEventId === "string" || raw.latestEventId === null
				? (raw.latestEventId ?? null)
				: null,
		latestStateHash:
			typeof raw.latestStateHash === "string" || raw.latestStateHash === null
				? (raw.latestStateHash ?? null)
				: null,
		latestSnapshotId:
			typeof raw.latestSnapshotId === "string" || raw.latestSnapshotId === null
				? (raw.latestSnapshotId ?? null)
				: null,
		latestSnapshotPath:
			typeof raw.latestSnapshotPath === "string" ||
			raw.latestSnapshotPath === null
				? (raw.latestSnapshotPath ?? null)
				: null,
		snapshotCount:
			typeof raw.snapshotCount === "number" ? raw.snapshotCount : 0,
		recentEventIds: toStringArray(raw.recentEventIds),
		activeConflictIds: toStringArray(raw.activeConflictIds),
		correctionEventIds: toStringArray(raw.correctionEventIds),
		integrity: {
			status: "valid",
			currentStateHash:
				typeof raw.integrity?.currentStateHash === "string" ||
				raw.integrity?.currentStateHash === null
					? (raw.integrity?.currentStateHash ?? null)
					: null,
			eventLogHash:
				typeof raw.integrity?.eventLogHash === "string" ||
				raw.integrity?.eventLogHash === null
					? (raw.integrity?.eventLogHash ?? null)
					: null,
			latestSnapshotHash:
				typeof raw.integrity?.latestSnapshotHash === "string" ||
				raw.integrity?.latestSnapshotHash === null
					? (raw.integrity?.latestSnapshotHash ?? null)
					: null,
		},
		replayStatus: {
			canReplayFromEventZero:
				raw.replayStatus?.canReplayFromEventZero !== false,
			canReplayFromLatestSnapshot:
				raw.replayStatus?.canReplayFromLatestSnapshot === true,
			lastReplayMode:
				raw.replayStatus?.lastReplayMode === "events-only" ||
				raw.replayStatus?.lastReplayMode === "latest-snapshot" ||
				raw.replayStatus?.lastReplayMode === "from-event"
					? raw.replayStatus.lastReplayMode
					: null,
		},
	};
}

export function validateSchemaVersion(
	value: unknown,
	options: {
		allowMissing?: boolean;
		supported?: number[];
	} = {},
): number {
	const supported = options.supported ?? [RUNTIME_SCHEMA_VERSION];
	if (value === undefined && options.allowMissing) {
		return RUNTIME_SCHEMA_VERSION;
	}
	if (typeof value !== "number" || !supported.includes(value)) {
		throw new Error(
			`Unsupported runtime artifact schema version${typeof value === "number" ? `: ${value}` : ""}.`,
		);
	}
	return value;
}

export function createValidationIssue(args: {
	code: RuntimeValidationCode;
	fieldName?: string | null;
	message: string;
	conflictId?: string | null;
}): RuntimeValidationIssue {
	return {
		code: args.code,
		fieldName: args.fieldName ?? null,
		message: args.message,
		conflictId: args.conflictId ?? null,
	};
}

export function validateEntityCatalogIntegrity(
	catalog: EntityCatalog,
): RuntimeValidationIssue[] {
	const issues: RuntimeValidationIssue[] = [];
	const seenIds = new Set<string>();
	const seenAliases = new Map<string, string>();
	for (const [kind, entries] of Object.entries(catalog) as Array<
		[keyof EntityCatalog, EntityRecord[]]
	>) {
		for (const entry of entries) {
			if (seenIds.has(entry.id)) {
				issues.push(
					createValidationIssue({
						code: "duplicate_entity_id",
						fieldName: kind,
						message: `Duplicate entity id detected: ${entry.id}.`,
					}),
				);
			}
			seenIds.add(entry.id);
			for (const alias of entry.aliases) {
				const normalizedAlias = alias.trim().toLowerCase();
				const existing = seenAliases.get(normalizedAlias);
				if (existing && existing !== entry.id) {
					issues.push(
						createValidationIssue({
							code: "ambiguous_entity_alias",
							fieldName: kind,
							message: `Alias "${alias}" resolves to multiple entities.`,
						}),
					);
				}
				seenAliases.set(normalizedAlias, entry.id);
			}
		}
	}
	for (const duplicate of findPotentialDuplicateEntities(catalog)) {
		issues.push(
			createValidationIssue({
				code: "ambiguous_entity_alias",
				fieldName: duplicate.kind,
				message: `Potential duplicate entities detected between ${duplicate.primaryId} and ${duplicate.duplicateId}.`,
			}),
		);
	}
	return issues;
}

export function validateCurrentStateIntegrity(args: {
	currentState: RuntimeCurrentState;
	catalog: EntityCatalog;
	nowIso?: string | null;
}): RuntimeValidationIssue[] {
	const issues: RuntimeValidationIssue[] = [];
	const { currentState, catalog } = args;
	if (
		currentState.currentLocation &&
		!findEntityId(catalog, "locations", currentState.currentLocation)
	) {
		issues.push(
			createValidationIssue({
				code: "broken_location_reference",
				fieldName: "currentLocation",
				message: `Current location "${currentState.currentLocation}" no longer resolves to a known location.`,
			}),
		);
	}

	for (const quest of currentState.activeQuests) {
		if (!findEntityId(catalog, "quests", quest)) {
			issues.push(
				createValidationIssue({
					code: "broken_quest_reference",
					fieldName: "activeQuests",
					message: `Active quest "${quest}" no longer resolves to a known quest.`,
				}),
			);
		}
	}

	for (const faction of currentState.relevantFactions) {
		if (!findEntityId(catalog, "factions", faction)) {
			issues.push(
				createValidationIssue({
					code: "broken_faction_reference",
					fieldName: "relevantFactions",
					message: `Relevant faction "${faction}" no longer resolves to a known faction.`,
				}),
			);
		}
	}

	for (const clock of currentState.activeClocks) {
		if (
			!findEntityId(catalog, "clocks", clock.name) &&
			!catalog.clocks.some((entry) => entry.id === clock.id)
		) {
			issues.push(
				createValidationIssue({
					code: "broken_clock_reference",
					fieldName: "activeClocks",
					message: `Active clock "${clock.name}" no longer resolves to a known clock.`,
				}),
			);
		}
	}

	for (const factionId of Object.keys(currentState.factionPressure)) {
		if (!catalog.factions.some((entry) => entry.id === factionId)) {
			issues.push(
				createValidationIssue({
					code: "broken_faction_pressure_reference",
					fieldName: "factionPressure",
					message: `Faction pressure references stale faction id "${factionId}".`,
				}),
			);
		}
	}

	if (
		args.nowIso &&
		currentState.worldTime.currentDateTimeISO &&
		args.nowIso < currentState.worldTime.currentDateTimeISO
	) {
		issues.push(
			createValidationIssue({
				code: "invalid_time_regression",
				fieldName: "worldTime",
				message: `Time regression detected: ${args.nowIso} is earlier than current world time ${currentState.worldTime.currentDateTimeISO}.`,
			}),
		);
	}

	for (const consequence of currentState.unresolvedConsequences) {
		const referencesKnownFaction = catalog.factions.some((entry) =>
			consequence.toLowerCase().includes(entry.name.toLowerCase()),
		);
		if (!referencesKnownFaction && catalog.factions.length > 0) {
			issues.push(
				createValidationIssue({
					code: "orphaned_consequence",
					fieldName: "unresolvedConsequences",
					message: `Unresolved consequence "${consequence}" is not linked to a known faction.`,
				}),
			);
		}
	}

	for (const record of currentState.consequenceRecords) {
		if (
			record.factionId &&
			!catalog.factions.some((entry) => entry.id === record.factionId)
		) {
			issues.push(
				createValidationIssue({
					code: "broken_faction_pressure_reference",
					fieldName: "consequenceRecords",
					message: `Consequence "${record.description}" references stale faction id "${record.factionId}".`,
				}),
			);
		}
	}

	return issues;
}

export function mapToolNameToStoredEventType(args: {
	toolName?: string;
	canonBasis?: string;
}): RuntimeStoredEventType {
	if (args.canonBasis === "explicit-user-correction") {
		return "user_correction";
	}
	switch (args.toolName) {
		case "player_action":
			return "player_action";
		case "simulation_tick":
			return "simulation_tick";
		case "user_correction":
			return "user_correction";
		case "bootstrap":
			return "bootstrap";
		default:
			return "world_sync";
	}
}

export function migrateCurrentStateArtifact(args: {
	raw: Record<string, unknown>;
	catalog?: EntityCatalog | null;
	nowIso?: string | null;
}): RuntimeCurrentState {
	validateSchemaVersion(args.raw.schemaVersion, {
		allowMissing: true,
		supported: [RUNTIME_SCHEMA_VERSION],
	});
	return normalizeCurrentState(args.raw as Partial<RuntimeCurrentState>, {
		catalog: args.catalog ?? null,
		nowIso: args.nowIso ?? null,
	});
}

export function migrateEntityCatalogArtifact(
	raw: Record<string, unknown>,
): EntityCatalog {
	validateSchemaVersion(raw.schemaVersion, {
		allowMissing: true,
		supported: [RUNTIME_SCHEMA_VERSION],
	});
	return normalizeEntityCatalog(
		raw as Partial<EntityCatalog> & {
			records?: Partial<EntityCatalog>;
		},
	);
}

export function migrateConflictManifestArtifact(
	raw: Record<string, unknown>,
): RuntimeConflictManifest {
	validateSchemaVersion(raw.schemaVersion, {
		allowMissing: true,
		supported: [RUNTIME_SCHEMA_VERSION],
	});
	return normalizeConflictManifest(raw as Partial<RuntimeConflictManifest>);
}

export function migrateDiagnosticsManifestArtifact(
	raw: Record<string, unknown>,
): RuntimeDiagnosticsManifest {
	validateSchemaVersion(raw.schemaVersion, {
		allowMissing: true,
		supported: [RUNTIME_SCHEMA_VERSION],
	});
	return normalizeDiagnosticsManifest(
		raw as Partial<RuntimeDiagnosticsManifest>,
	);
}

export function migrateSnapshotIndexArtifact(
	raw: Record<string, unknown>,
): RuntimeSnapshotIndexManifest {
	validateSchemaVersion(raw.schemaVersion, {
		allowMissing: true,
		supported: [RUNTIME_SCHEMA_VERSION],
	});
	return normalizeSnapshotIndexManifest(
		raw as Partial<RuntimeSnapshotIndexManifest>,
	);
}

export function migrateSnapshotArtifact(
	raw: Record<string, unknown>,
): RuntimeSnapshotRecord {
	validateSchemaVersion(raw.schemaVersion, {
		allowMissing: true,
		supported: [RUNTIME_SCHEMA_VERSION],
	});
	return normalizeSnapshotRecord(raw as Partial<RuntimeSnapshotRecord>);
}

export function normalizeEntityCatalogAliases(
	catalog: EntityCatalog,
): EntityCatalog {
	return Object.fromEntries(
		Object.entries(catalog).map(([kind, entries]) => [
			kind,
			entries.map((entry) => ({
				...entry,
				aliases: uniqueStrings(
					[entry.name, ...entry.aliases].map((alias) => alias.trim()),
				),
			})),
		]),
	) as EntityCatalog;
}

export function findPotentialDuplicateEntities(catalog: EntityCatalog): Array<{
	kind: keyof EntityCatalog;
	primaryId: string;
	duplicateId: string;
	sharedAliases: string[];
}> {
	const duplicates: Array<{
		kind: keyof EntityCatalog;
		primaryId: string;
		duplicateId: string;
		sharedAliases: string[];
	}> = [];
	for (const [kind, entries] of Object.entries(catalog) as Array<
		[keyof EntityCatalog, EntityRecord[]]
	>) {
		for (let index = 0; index < entries.length; index += 1) {
			for (
				let compareIndex = index + 1;
				compareIndex < entries.length;
				compareIndex += 1
			) {
				const left = entries[index];
				const right = entries[compareIndex];
				if (!left || !right) {
					continue;
				}
				const leftAliases = new Set(
					[left.name, ...left.aliases].map(normalizeEntityAlias),
				);
				const rightAliases = new Set(
					[right.name, ...right.aliases].map(normalizeEntityAlias),
				);
				const sharedAliases = [...leftAliases].filter((alias) =>
					rightAliases.has(alias),
				);
				if (
					sharedAliases.length > 0 ||
					slugify(left.name) === slugify(right.name)
				) {
					duplicates.push({
						kind,
						primaryId: left.id,
						duplicateId: right.id,
						sharedAliases,
					});
				}
			}
		}
	}
	return duplicates;
}

export function replaceEntityReferenceNames(args: {
	currentState: RuntimeCurrentState;
	fromName: string;
	toName: string;
}): RuntimeCurrentState {
	const from = normalizeEntityAlias(args.fromName);
	const replaceArray = (values: string[]) =>
		values.map((value) =>
			normalizeEntityAlias(value) === from ? args.toName : value,
		);
	return normalizeCurrentState(
		{
			...args.currentState,
			currentLocation:
				args.currentState.currentLocation &&
				normalizeEntityAlias(args.currentState.currentLocation) === from
					? args.toName
					: args.currentState.currentLocation,
			activeQuests: replaceArray(args.currentState.activeQuests),
			relevantFactions: replaceArray(args.currentState.relevantFactions),
			recentEvents: replaceArray(args.currentState.recentEvents),
			factsRevealed: replaceArray(args.currentState.factsRevealed),
			factionConsequences: replaceArray(args.currentState.factionConsequences),
			clockProgress: replaceArray(args.currentState.clockProgress),
			npcAttitudes: Object.fromEntries(
				Object.entries(args.currentState.npcAttitudes).map(([key, value]) => [
					normalizeEntityAlias(key) === from ? args.toName : key,
					value,
				]),
			),
			unresolvedConsequences: replaceArray(
				args.currentState.unresolvedConsequences,
			),
		},
		{
			nowIso: args.currentState.updatedAtISO,
			catalog: null,
		},
	);
}

export function mergeEntityRecords(args: {
	catalog: EntityCatalog;
	kind: keyof EntityCatalog;
	primaryName: string;
	duplicateName: string;
}): EntityCatalog {
	const entries = [...args.catalog[args.kind]];
	const primary = entries.find(
		(entry) =>
			normalizeEntityAlias(entry.name) ===
			normalizeEntityAlias(args.primaryName),
	);
	const duplicate = entries.find(
		(entry) =>
			entry.id !== primary?.id &&
			normalizeEntityAlias(entry.name) ===
				normalizeEntityAlias(args.duplicateName),
	);
	if (!primary || !duplicate) {
		return args.catalog;
	}
	const mergedEntry: EntityRecord = {
		...primary,
		aliases: uniqueStrings([
			primary.name,
			...primary.aliases,
			duplicate.name,
			...duplicate.aliases,
		]),
		sourcePaths: uniqueStrings([
			...primary.sourcePaths,
			...duplicate.sourcePaths,
		]),
	};
	return {
		...args.catalog,
		[args.kind]: entries
			.filter((entry) => entry.id !== duplicate.id && entry.id !== primary.id)
			.concat(mergedEntry),
	};
}

export function splitEntityRecord(args: {
	catalog: EntityCatalog;
	kind: keyof EntityCatalog;
	existingName: string;
	newName: string;
	newAliases: string[];
}): EntityCatalog {
	const entries = [...args.catalog[args.kind]];
	const existing = entries.find(
		(entry) =>
			normalizeEntityAlias(entry.name) ===
			normalizeEntityAlias(args.existingName),
	);
	if (!existing) {
		return args.catalog;
	}
	const aliasesToMove = uniqueStrings([args.newName, ...args.newAliases]);
	const nextExisting: EntityRecord = {
		...existing,
		aliases: existing.aliases.filter(
			(alias) =>
				!aliasesToMove.some(
					(candidate) =>
						normalizeEntityAlias(candidate) === normalizeEntityAlias(alias),
				),
		),
	};
	const newEntry: EntityRecord = {
		id: createStableEntityId(
			args.kind === "recentEvents"
				? "recent-event"
				: (args.kind.slice(0, -1) as EntityKind),
			args.newName,
		),
		name: args.newName,
		aliases: aliasesToMove,
		sourcePaths: existing.sourcePaths,
	};
	return {
		...args.catalog,
		[args.kind]: entries
			.filter((entry) => entry.id !== existing.id)
			.concat(nextExisting, newEntry),
	};
}

export function upsertEntityRecord(args: {
	catalog: EntityCatalog;
	kind: keyof EntityCatalog;
	name: string;
	aliases?: string[];
	sourcePath?: string | null;
}): EntityCatalog {
	const normalizedName = normalizeEntityAlias(args.name);
	const entries = [...args.catalog[args.kind]];
	const existing = entries.find(
		(entry) =>
			normalizeEntityAlias(entry.name) === normalizedName ||
			entry.aliases.some(
				(alias) => normalizeEntityAlias(alias) === normalizedName,
			),
	);
	const aliases = uniqueStrings([args.name, ...(args.aliases ?? [])]);
	if (!existing) {
		const kind =
			args.kind === "recentEvents"
				? "recent-event"
				: (args.kind.slice(0, -1) as EntityKind);
		return {
			...args.catalog,
			[args.kind]: entries.concat({
				id: createStableEntityId(kind, args.name),
				name: args.name,
				aliases,
				sourcePaths: args.sourcePath ? [args.sourcePath] : [],
			}),
		};
	}

	const nextEntry: EntityRecord = {
		...existing,
		aliases: uniqueStrings([...existing.aliases, ...aliases]),
		sourcePaths: uniqueStrings(
			args.sourcePath
				? [...existing.sourcePaths, args.sourcePath]
				: existing.sourcePaths,
		),
	};
	return {
		...args.catalog,
		[args.kind]: entries.map((entry) =>
			entry.id === existing.id ? nextEntry : entry,
		),
	};
}
