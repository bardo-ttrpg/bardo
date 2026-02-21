import { writeFile } from "node:fs/promises";
import {
	ensureParentDirectoryExists,
	readTextIfExists,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";

type IdempotencyEntry = {
	scope: string;
	createdAtISO: string;
	result: unknown;
};

type IdempotencyRecord = Record<string, IdempotencyEntry>;

async function readStore(filePath: string): Promise<IdempotencyRecord> {
	const raw = await readTextIfExists(filePath);
	if (!raw) {
		return {};
	}

	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) {
			return {};
		}
		return parsed as IdempotencyRecord;
	} catch {
		return {};
	}
}

async function writeStore(
	filePath: string,
	store: IdempotencyRecord,
): Promise<void> {
	await ensureParentDirectoryExists(filePath);
	await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
}

function resolveStorePath(bardoRoot: string): string {
	return resolvePathInsideRoot(bardoRoot, "_settings/idempotency.json");
}

export async function getIdempotentResult(args: {
	bardoRoot: string;
	key: string;
	scope: string;
}): Promise<unknown | null> {
	const filePath = resolveStorePath(args.bardoRoot);
	const store = await readStore(filePath);
	const entry = store[args.key];
	if (!entry || entry.scope !== args.scope) {
		return null;
	}
	return entry.result;
}

export async function setIdempotentResult(args: {
	bardoRoot: string;
	key: string;
	scope: string;
	result: unknown;
	nowIso: string;
}): Promise<void> {
	const filePath = resolveStorePath(args.bardoRoot);
	const store = await readStore(filePath);
	store[args.key] = {
		scope: args.scope,
		createdAtISO: args.nowIso,
		result: args.result,
	};
	await writeStore(filePath, store);
}
