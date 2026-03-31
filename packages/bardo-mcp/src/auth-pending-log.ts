import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { canonicalJsonStringify } from "./canonical-json";

type PendingUsageEntry = {
	id: string;
	ts: number;
	tool: string;
	action: string;
	units: number;
	workspace_id: string;
};

type PendingUsageRecord = {
	version: 1;
	key_hash: string;
	workspace_id: string;
	batch_id: string;
	entries: PendingUsageEntry[];
};

let appendQueue: Promise<void> = Promise.resolve();
const pendingEntrySeqByPath = new Map<string, number>();

function withAppendLock<T>(fn: () => Promise<T>): Promise<T> {
	const releasePrevious = appendQueue;
	let releaseCurrent = () => {};
	appendQueue = new Promise<void>((resolve) => {
		releaseCurrent = resolve;
	});
	return (async () => {
		await releasePrevious;
		try {
			return await fn();
		} finally {
			releaseCurrent();
		}
	})();
}

export function sha256(input: string): string {
	return createHash("sha256").update(input, "utf8").digest("hex");
}

async function reservePendingEntrySequence(
	pendingPath: string,
): Promise<{ seq: number; previousSeq: number | null }> {
	const previousSeq = pendingEntrySeqByPath.get(pendingPath);
	if (typeof previousSeq === "number") {
		const seq = previousSeq + 1;
		pendingEntrySeqByPath.set(pendingPath, seq);
		return { seq, previousSeq };
	}

	const existing = await loadPendingUsageEntries({ pendingPath });
	const seq = existing.length + 1;
	pendingEntrySeqByPath.set(pendingPath, seq);
	return { seq, previousSeq: null };
}

function rollbackReservedPendingEntrySequence(args: {
	pendingPath: string;
	previousSeq: number | null;
}): void {
	if (args.previousSeq === null) {
		pendingEntrySeqByPath.delete(args.pendingPath);
		return;
	}
	pendingEntrySeqByPath.set(args.pendingPath, args.previousSeq);
}

function toPendingEntry(value: unknown): PendingUsageEntry | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	const record = value as Record<string, unknown>;
	if (
		typeof record.id !== "string" ||
		typeof record.ts !== "number" ||
		typeof record.tool !== "string" ||
		typeof record.action !== "string" ||
		typeof record.units !== "number" ||
		typeof record.workspace_id !== "string"
	) {
		return null;
	}
	return {
		id: record.id,
		ts: record.ts,
		tool: record.tool,
		action: record.action,
		units: record.units,
		workspace_id: record.workspace_id,
	};
}

export async function loadPendingUsageEntries(args: {
	pendingPath: string;
}): Promise<PendingUsageEntry[]> {
	const raw = await readFile(args.pendingPath, "utf8").catch(
		(error: unknown) => {
			if (
				typeof error === "object" &&
				error !== null &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return null;
			}
			throw error;
		},
	);
	if (!raw) {
		return [];
	}

	const lines = raw.split("\n");
	const entries: PendingUsageEntry[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index]?.trim();
		if (!line) {
			continue;
		}
		try {
			const parsed = JSON.parse(line);
			const entry = toPendingEntry(parsed);
			if (!entry) {
				throw new Error("Invalid NDJSON pending entry.");
			}
			entries.push(entry);
		} catch (error) {
			const isLastLine = index === lines.length - 1;
			if (isLastLine) {
				// Ignore a trailing partial line left by a crash.
				break;
			}
			throw error;
		}
	}
	return entries;
}

export async function appendPendingUsageEntry(args: {
	pendingPath: string;
	keyHash: string;
	workspaceId: string;
	ts: number;
	tool: string;
	action: string;
	units: number;
}): Promise<PendingUsageEntry> {
	return await withAppendLock(async () => {
		const reservation = await reservePendingEntrySequence(args.pendingPath);
		const id = sha256(
			`${args.workspaceId}|${args.ts}|${args.tool}|${args.action}|${args.units}|${reservation.seq}`,
		);
		const entry: PendingUsageEntry = {
			id,
			ts: args.ts,
			tool: args.tool,
			action: args.action,
			units: args.units,
			workspace_id: args.workspaceId,
		};

		await mkdir(path.dirname(args.pendingPath), { recursive: true });
		try {
			await appendFile(args.pendingPath, `${JSON.stringify(entry)}\n`, {
				encoding: "utf8",
				mode: 0o600,
				flag: "a",
			});
		} catch (error) {
			rollbackReservedPendingEntrySequence({
				pendingPath: args.pendingPath,
				previousSeq: reservation.previousSeq,
			});
			throw error;
		}
		return entry;
	});
}

export function buildPendingBatch(args: {
	keyHash: string;
	workspaceId: string;
	entries: PendingUsageEntry[];
}): PendingUsageRecord {
	const canonicalEntries = canonicalJsonStringify(args.entries);
	const batchId = sha256(
		`${canonicalEntries}|${args.keyHash}|${args.workspaceId}`,
	);
	return {
		version: 1,
		key_hash: args.keyHash,
		workspace_id: args.workspaceId,
		batch_id: batchId,
		entries: args.entries,
	};
}

export async function clearPendingUsageEntries(args: {
	pendingPath: string;
}): Promise<void> {
	pendingEntrySeqByPath.delete(args.pendingPath);
	await rm(args.pendingPath, { force: true });
}
