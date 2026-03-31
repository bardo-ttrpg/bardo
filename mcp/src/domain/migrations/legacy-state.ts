import { appendCanonicalEvent, readCanonicalEvents } from "../events/store";
import { loadPreferredCurrentState } from "../projections/preferred-state";
import { regenerateProjectionsForEventTypes } from "../projections/refresh";
import { appendSchemaMigrationRecord } from "../schema/version";

type LegacyStateMigrationResult = {
	migrated: boolean;
	dryRun: boolean;
	canonicalEventsBefore: number;
	canonicalEventsAfter: number;
	migrationEventId: string | null;
	manifestPath: string | null;
	projectionPaths: string[];
	reason: string;
	report: {
		status: "migrated" | "skipped" | "dry_run";
		warnings: string[];
		errors: string[];
		inferredFields: string[];
		skippedFields: string[];
	};
};

function migrationEventId(idempotencyKey: string | undefined): string {
	if (!idempotencyKey) {
		return `evt-legacy-migration-${crypto.randomUUID()}`;
	}
	const normalized = idempotencyKey
		.toLowerCase()
		.replaceAll(/[^a-z0-9_-]/g, "-")
		.slice(0, 80);
	return `evt-legacy-migration-${normalized}`;
}

function inspectLegacyStateContent(rawContent: string): {
	warnings: string[];
	inferredFields: string[];
	skippedFields: string[];
} {
	const warnings: string[] = [];
	const inferredFields = new Set<string>(["event.data.migratedFrom"]);
	const skippedFields = new Set<string>();
	const trimmed = rawContent.trim();

	if (!trimmed) {
		warnings.push(
			"Legacy state markdown body is empty; defaults were applied.",
		);
		inferredFields.add("state.worldTimeISO");
		inferredFields.add("state.currentLocation");
		inferredFields.add("state.counters.unknownNpc");
		inferredFields.add("state.counters.unknownLocation");
		inferredFields.add("state.locations");
		inferredFields.add("state.lastAction");
		return {
			warnings,
			inferredFields: [...inferredFields],
			skippedFields: [...skippedFields],
		};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		warnings.push(
			"Legacy state JSON is malformed; migration used safe defaults where needed.",
		);
		inferredFields.add("state.worldTimeISO");
		inferredFields.add("state.currentLocation");
		inferredFields.add("state.counters.unknownNpc");
		inferredFields.add("state.counters.unknownLocation");
		inferredFields.add("state.locations");
		inferredFields.add("state.lastAction");
		return {
			warnings,
			inferredFields: [...inferredFields],
			skippedFields: [...skippedFields],
		};
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		warnings.push(
			"Legacy state JSON is not an object; migration used safe defaults where needed.",
		);
		inferredFields.add("state.worldTimeISO");
		inferredFields.add("state.currentLocation");
		inferredFields.add("state.counters.unknownNpc");
		inferredFields.add("state.counters.unknownLocation");
		inferredFields.add("state.locations");
		inferredFields.add("state.lastAction");
		return {
			warnings,
			inferredFields: [...inferredFields],
			skippedFields: [...skippedFields],
		};
	}

	const record = parsed as Record<string, unknown>;
	const knownTopLevel = new Set([
		"worldTimeISO",
		"currentLocation",
		"counters",
		"locations",
		"lastAction",
	]);

	if (typeof record.worldTimeISO !== "string") {
		inferredFields.add("state.worldTimeISO");
	}
	if (typeof record.currentLocation !== "string") {
		inferredFields.add("state.currentLocation");
	}
	if (typeof record.lastAction !== "string") {
		inferredFields.add("state.lastAction");
	}
	if (typeof record.locations !== "object" || record.locations === null) {
		inferredFields.add("state.locations");
	}

	const counters = record.counters;
	if (
		typeof counters !== "object" ||
		counters === null ||
		Array.isArray(counters)
	) {
		inferredFields.add("state.counters.unknownNpc");
		inferredFields.add("state.counters.unknownLocation");
	} else {
		const countersRecord = counters as Record<string, unknown>;
		if (typeof countersRecord.unknownNpc !== "number") {
			inferredFields.add("state.counters.unknownNpc");
		}
		if (typeof countersRecord.unknownLocation !== "number") {
			inferredFields.add("state.counters.unknownLocation");
		}
	}

	for (const key of Object.keys(record)) {
		if (!knownTopLevel.has(key)) {
			skippedFields.add(`state.${key}`);
		}
	}

	return {
		warnings,
		inferredFields: [...inferredFields],
		skippedFields: [...skippedFields],
	};
}

export async function migrateLegacyStateToCanonicalEvents(args: {
	bardoRoot: string;
	nowIso: string;
	dryRun: boolean;
	idempotencyKey?: string;
}): Promise<LegacyStateMigrationResult> {
	const eventsBefore = await readCanonicalEvents({ bardoRoot: args.bardoRoot });
	if (eventsBefore.length > 0) {
		return {
			migrated: false,
			dryRun: args.dryRun,
			canonicalEventsBefore: eventsBefore.length,
			canonicalEventsAfter: eventsBefore.length,
			migrationEventId: null,
			manifestPath: null,
			projectionPaths: [],
			reason: "Canonical events already exist; migration skipped.",
			report: {
				status: "skipped",
				warnings: [],
				errors: [],
				inferredFields: [],
				skippedFields: [],
			},
		};
	}

	const preferredState = await loadPreferredCurrentState({
		bardoRoot: args.bardoRoot,
		consumer: "migrate_legacy_state",
		allowLegacyFallbackInStrict: true,
	});
	if (preferredState.source !== "legacy_state") {
		return {
			migrated: false,
			dryRun: args.dryRun,
			canonicalEventsBefore: eventsBefore.length,
			canonicalEventsAfter: eventsBefore.length,
			migrationEventId: null,
			manifestPath: null,
			projectionPaths: [],
			reason: "No legacy state snapshot available for migration.",
			report: {
				status: "skipped",
				warnings: [],
				errors: [],
				inferredFields: [],
				skippedFields: [],
			},
		};
	}

	const legacyInspection = inspectLegacyStateContent(
		preferredState.legacyState.rawContent,
	);

	const eventId = migrationEventId(args.idempotencyKey);
	if (args.dryRun) {
		return {
			migrated: true,
			dryRun: true,
			canonicalEventsBefore: eventsBefore.length,
			canonicalEventsAfter: eventsBefore.length + 1,
			migrationEventId: eventId,
			manifestPath: null,
			projectionPaths: [],
			reason: "Legacy state migration dry-run computed.",
			report: {
				status: "dry_run",
				warnings: legacyInspection.warnings,
				errors: [],
				inferredFields: legacyInspection.inferredFields,
				skippedFields: legacyInspection.skippedFields,
			},
		};
	}

	await appendCanonicalEvent({
		bardoRoot: args.bardoRoot,
		event: {
			id: eventId,
			type: "legacy_state_migrated",
			atISO: args.nowIso,
			source: "migrate_legacy_state",
			data: {
				legacyStatePath: preferredState.legacyState.path,
				stateAfter: preferredState.legacyState.state,
				migratedFrom: "legacy_state",
			},
		},
	});

	const refreshed = await regenerateProjectionsForEventTypes({
		bardoRoot: args.bardoRoot,
		eventTypes: ["legacy_state_migrated"],
	});
	const schemaManifest = await appendSchemaMigrationRecord({
		bardoRoot: args.bardoRoot,
		migrationId: "legacy_state_migrated",
		notes:
			"Migrated legacy state/current.md snapshot into canonical event log.",
		nowIso: args.nowIso,
	});
	const eventsAfter = await readCanonicalEvents({ bardoRoot: args.bardoRoot });

	return {
		migrated: true,
		dryRun: false,
		canonicalEventsBefore: eventsBefore.length,
		canonicalEventsAfter: eventsAfter.length,
		migrationEventId: eventId,
		manifestPath: schemaManifest.manifestPath,
		projectionPaths: refreshed.map((projection) => projection.projectionPath),
		reason: "Legacy state migration completed.",
		report: {
			status: "migrated",
			warnings: legacyInspection.warnings,
			errors: [],
			inferredFields: legacyInspection.inferredFields,
			skippedFields: legacyInspection.skippedFields,
		},
	};
}
