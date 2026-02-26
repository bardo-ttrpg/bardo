import { appendFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
	ensureParentDirectoryExists,
	readTextIfExists,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";

const CANONICAL_EVENT_LOG_PATH = "events/canonical.ndjson";

const canonicalEventDataSchema = z.record(z.string(), z.unknown());

export const canonicalEventSchema = z.object({
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

function resolveCanonicalEventLogPath(bardoRoot: string): string {
	return resolvePathInsideRoot(bardoRoot, CANONICAL_EVENT_LOG_PATH);
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

export async function appendCanonicalEvent(args: {
	bardoRoot: string;
	event: CanonicalEventInput;
}): Promise<CanonicalEvent> {
	const eventInput = canonicalEventSchema.parse(args.event);
	const existing = await readCanonicalEvents({ bardoRoot: args.bardoRoot });
	if (existing.some((event) => event.id === eventInput.id)) {
		throw new Error(`Canonical event '${eventInput.id}' already exists.`);
	}

	const sequence = existing.length + 1;
	const storedEvent: CanonicalEvent = {
		sequence,
		...eventInput,
	};
	const logPath = resolveCanonicalEventLogPath(args.bardoRoot);
	await ensureParentDirectoryExists(logPath);
	await appendFile(logPath, `${JSON.stringify(storedEvent)}\n`, "utf8");
	return storedEvent;
}

export async function replayCanonicalEvents(args: {
	bardoRoot: string;
}): Promise<CanonicalEvent[]> {
	return readCanonicalEvents(args);
}
