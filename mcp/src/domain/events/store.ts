import { appendFile, stat, writeFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
	ensureParentDirectoryExists,
	readTextIfExists,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";

const CANONICAL_EVENT_LOG_PATH = "events/canonical.ndjson";
const CANONICAL_EVENT_METADATA_PATH = "_settings/canonical-event-log-meta.json";

const canonicalEventDataSchema = z.record(z.string(), z.unknown());

const canonicalEventSchema = z.object({
	id: z.string().trim().min(1).max(120),
	type: z.string().trim().min(1).max(120),
	atISO: z.iso.datetime(),
	source: z.string().trim().min(1).max(120),
	data: canonicalEventDataSchema,
});

const canonicalStoredEventSchema = canonicalEventSchema.extend({
	sequence: z.number().int().positive(),
});

export type CanonicalEvent = z.infer<typeof canonicalStoredEventSchema>;
type CanonicalEventInput = z.infer<typeof canonicalEventSchema>;

const canonicalEventMetadataSchema = z.object({
	version: z.literal(1),
	lastSequence: z.number().int().nonnegative(),
	eventCount: z.number().int().nonnegative(),
	logBytes: z.number().int().nonnegative(),
	eventIds: z.record(z.string(), z.number().int().positive()),
	lastEvent: canonicalStoredEventSchema.optional(),
});

type CanonicalEventMetadata = z.infer<typeof canonicalEventMetadataSchema>;

function resolveCanonicalEventLogPath(bardoRoot: string): string {
	return resolvePathInsideRoot(bardoRoot, CANONICAL_EVENT_LOG_PATH);
}

function resolveCanonicalEventMetadataPath(bardoRoot: string): string {
	return resolvePathInsideRoot(bardoRoot, CANONICAL_EVENT_METADATA_PATH);
}

function parseLine(args: { line: string; lineNumber: number }): CanonicalEvent {
	let parsed: unknown;
	try {
		parsed = JSON.parse(args.line);
	} catch {
		throw new Error(
			`Canonical event log contains invalid JSON at line ${args.lineNumber}.`,
		);
	}

	const validated = canonicalStoredEventSchema.safeParse(parsed);
	if (!validated.success) {
		throw new Error(
			`Canonical event log contains invalid event payload at line ${args.lineNumber}.`,
		);
	}
	return validated.data;
}

export async function readCanonicalEvents(args: {
	bardoRoot: string;
}): Promise<CanonicalEvent[]> {
	const logPath = resolveCanonicalEventLogPath(args.bardoRoot);
	const raw = await readTextIfExists(logPath);
	if (!raw?.trim()) {
		return [];
	}

	const lines = raw
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	return lines.map((line, index) => parseLine({ line, lineNumber: index + 1 }));
}

function buildMetadataFromEvents(
	events: CanonicalEvent[],
	rawLog: string,
): CanonicalEventMetadata {
	return {
		version: 1,
		lastSequence: events.at(-1)?.sequence ?? 0,
		eventCount: events.length,
		logBytes: Buffer.byteLength(rawLog, "utf8"),
		eventIds: Object.fromEntries(
			events.map((event) => [event.id, event.sequence]),
		),
		lastEvent: events.at(-1),
	};
}

async function writeCanonicalEventMetadata(args: {
	bardoRoot: string;
	metadata: CanonicalEventMetadata;
}): Promise<void> {
	const metadataPath = resolveCanonicalEventMetadataPath(args.bardoRoot);
	await ensureParentDirectoryExists(metadataPath);
	await writeFile(metadataPath, JSON.stringify(args.metadata, null, 2), "utf8");
}

async function readLogSize(logPath: string): Promise<number> {
	try {
		const details = await stat(logPath);
		return details.isFile() ? details.size : 0;
	} catch {
		return 0;
	}
}

async function loadCanonicalEventMetadata(args: {
	bardoRoot: string;
}): Promise<CanonicalEventMetadata> {
	const logPath = resolveCanonicalEventLogPath(args.bardoRoot);
	const metadataPath = resolveCanonicalEventMetadataPath(args.bardoRoot);
	const [rawMetadata, logSize] = await Promise.all([
		readTextIfExists(metadataPath),
		readLogSize(logPath),
	]);

	if (rawMetadata?.trim()) {
		try {
			const parsed = canonicalEventMetadataSchema.parse(
				JSON.parse(rawMetadata),
			);
			if (parsed.logBytes === logSize) {
				return parsed;
			}
		} catch {
			// Fall through to canonical rebuild.
		}
	}

	const rawLog = (await readTextIfExists(logPath)) ?? "";
	const events = rawLog.trim()
		? rawLog
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.length > 0)
				.map((line, index) => parseLine({ line, lineNumber: index + 1 }))
		: [];
	const metadata = buildMetadataFromEvents(events, rawLog);
	await writeCanonicalEventMetadata({
		bardoRoot: args.bardoRoot,
		metadata,
	});
	return metadata;
}

export async function appendCanonicalEvent(args: {
	bardoRoot: string;
	event: CanonicalEventInput;
}): Promise<CanonicalEvent> {
	const [storedEvent] = await appendCanonicalEvents({
		bardoRoot: args.bardoRoot,
		events: [args.event],
	});
	if (!storedEvent) {
		throw new Error("Canonical event append failed to store the input event.");
	}
	return storedEvent;
}

export async function appendCanonicalEvents(args: {
	bardoRoot: string;
	events: readonly CanonicalEventInput[];
}): Promise<CanonicalEvent[]> {
	const eventInputs = args.events.map((event) =>
		canonicalEventSchema.parse(event),
	);
	if (eventInputs.length === 0) {
		return [];
	}

	const metadata = await loadCanonicalEventMetadata({
		bardoRoot: args.bardoRoot,
	});
	const seenIncoming = new Set<string>();
	for (const eventInput of eventInputs) {
		if (metadata.eventIds[eventInput.id] || seenIncoming.has(eventInput.id)) {
			throw new Error(`Canonical event '${eventInput.id}' already exists.`);
		}
		seenIncoming.add(eventInput.id);
	}

	const storedEvents: CanonicalEvent[] = eventInputs.map(
		(eventInput, index) => ({
			sequence: metadata.lastSequence + index + 1,
			...eventInput,
		}),
	);
	const logPath = resolveCanonicalEventLogPath(args.bardoRoot);
	const appendedBlock = storedEvents
		.map((storedEvent) => `${JSON.stringify(storedEvent)}\n`)
		.join("");
	await ensureParentDirectoryExists(logPath);
	await appendFile(logPath, appendedBlock, "utf8");
	await writeCanonicalEventMetadata({
		bardoRoot: args.bardoRoot,
		metadata: {
			version: 1,
			lastSequence: storedEvents.at(-1)?.sequence ?? metadata.lastSequence,
			eventCount: metadata.eventCount + storedEvents.length,
			logBytes: metadata.logBytes + Buffer.byteLength(appendedBlock, "utf8"),
			eventIds: {
				...metadata.eventIds,
				...Object.fromEntries(
					storedEvents.map((storedEvent) => [
						storedEvent.id,
						storedEvent.sequence,
					]),
				),
			},
			lastEvent: storedEvents.at(-1),
		},
	});
	return storedEvents;
}

export async function readCanonicalEventLogStats(args: {
	bardoRoot: string;
}): Promise<{
	lastSequence: number;
	eventCount: number;
	lastEvent: CanonicalEvent | null;
}> {
	const metadata = await loadCanonicalEventMetadata({
		bardoRoot: args.bardoRoot,
	});
	return {
		lastSequence: metadata.lastSequence,
		eventCount: metadata.eventCount,
		lastEvent: metadata.lastEvent ?? null,
	};
}

export async function replayCanonicalEvents(args: {
	bardoRoot: string;
}): Promise<CanonicalEvent[]> {
	return readCanonicalEvents(args);
}
