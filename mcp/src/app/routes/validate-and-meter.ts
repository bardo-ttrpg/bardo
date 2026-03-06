import type { AuthContext } from "../../types/contracts";
import { withCors } from "../middleware/cors";
import type {
	McpUsageConsumeResult,
	McpUsageLimiter,
} from "../middleware/mcp-usage-limiter";

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
const RECONCILIATION_BATCH_TTL_MS = 24 * 60 * 60 * 1000;

const seenReconciliationBatches = new Map<string, number>();

type PendingUsageEntry = {
	id: string;
	ts: number;
	tool: string;
	action: string;
	units: number;
	workspace_id: string;
};

type ValidateAndMeterBody = {
	tool?: unknown;
	action?: unknown;
	workspace_id?: unknown;
	reconciliation?: {
		batch_id?: unknown;
		entries?: unknown;
	} | null;
};

function validFalse(
	status: number,
	reason: string,
	retryAfter?: number,
): Response {
	return withCors(
		new Response(
			JSON.stringify(
				typeof retryAfter === "number"
					? { valid: false, reason, retry_after: retryAfter }
					: { valid: false, reason },
			),
			{
				status,
				headers: {
					"content-type": "application/json",
				},
			},
		),
	);
}

function validTrue(args: {
	usage: McpUsageConsumeResult;
	plan: AuthContext["plan"];
}): Response {
	return withCors(
		new Response(
			JSON.stringify({
				valid: true,
				remaining_quota: args.usage.remaining,
				plan: args.plan ?? null,
			}),
			{
				status: 200,
				headers: {
					"content-type": "application/json",
				},
			},
		),
	);
}

function parsePendingEntries(value: unknown): PendingUsageEntry[] | null {
	if (!Array.isArray(value)) {
		return null;
	}
	const entriesById = new Map<string, PendingUsageEntry>();
	for (const item of value) {
		if (typeof item !== "object" || item === null) {
			return null;
		}
		const record = item as Record<string, unknown>;
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
		const parsed: PendingUsageEntry = {
			id: record.id,
			ts: record.ts,
			tool: record.tool,
			action: record.action,
			units: record.units,
			workspace_id: record.workspace_id,
		};
		const existing = entriesById.get(parsed.id);
		if (!existing) {
			entriesById.set(parsed.id, parsed);
			continue;
		}
		const isConflictingDuplicate =
			existing.ts !== parsed.ts ||
			existing.tool !== parsed.tool ||
			existing.action !== parsed.action ||
			existing.units !== parsed.units ||
			existing.workspace_id !== parsed.workspace_id;
		if (isConflictingDuplicate) {
			return null;
		}
	}
	return Array.from(entriesById.values());
}

function isFreshTimestamp(
	timestampHeader: string | null,
	nowMs = Date.now(),
): boolean {
	if (!timestampHeader) {
		return false;
	}
	const parsed = Number(timestampHeader);
	if (!Number.isFinite(parsed)) {
		return false;
	}
	return Math.abs(nowMs - Math.floor(parsed)) <= MAX_TIMESTAMP_SKEW_MS;
}

function pruneSeenBatches(nowMs = Date.now()): void {
	for (const [batchId, seenAt] of seenReconciliationBatches) {
		if (nowMs - seenAt > RECONCILIATION_BATCH_TTL_MS) {
			seenReconciliationBatches.delete(batchId);
		}
	}
}

function sumUnits(entries: PendingUsageEntry[]): number {
	let total = 0;
	for (const entry of entries) {
		if (!Number.isFinite(entry.units) || entry.units <= 0) {
			return -1;
		}
		total += Math.floor(entry.units);
	}
	return total;
}

export async function handleValidateAndMeterRequest(args: {
	request: Request;
	auth: AuthContext;
	meteringLimiter: McpUsageLimiter;
}): Promise<Response> {
	if (!isFreshTimestamp(args.request.headers.get("x-bardo-timestamp"))) {
		return validFalse(400, "timestamp_skew");
	}
	if (!args.auth.apiKey) {
		return validFalse(401, "invalid_key");
	}

	const body = (await args.request
		.json()
		.catch(() => null)) as ValidateAndMeterBody | null;
	if (!body || typeof body !== "object") {
		return validFalse(400, "invalid_payload");
	}

	if (seenReconciliationBatches.size > 0) {
		pruneSeenBatches();
	}

	let units = 0;
	const tool = typeof body.tool === "string" ? body.tool : null;
	const action = typeof body.action === "string" ? body.action : null;
	const reconciliation =
		body.reconciliation && typeof body.reconciliation === "object"
			? body.reconciliation
			: null;

	if (reconciliation) {
		const batchId =
			typeof reconciliation.batch_id === "string"
				? reconciliation.batch_id.trim()
				: "";
		if (!batchId) {
			return validFalse(400, "invalid_reconciliation_batch");
		}
		if (!seenReconciliationBatches.has(batchId)) {
			const entries = parsePendingEntries(reconciliation.entries);
			if (!entries) {
				return validFalse(400, "invalid_reconciliation_entries");
			}
			const reconciliationUnits = sumUnits(entries);
			if (reconciliationUnits < 0) {
				return validFalse(400, "invalid_reconciliation_units");
			}
			units += reconciliationUnits;
			seenReconciliationBatches.set(batchId, Date.now());
		}
	}

	if (tool && action) {
		// v6 charging model: each live metered tool invocation costs one unit.
		units += 1;
	}

	if (units < 1) {
		return validFalse(400, "missing_metering_work");
	}

	const usage = await args.meteringLimiter.consume({
		subjectId: args.auth.subjectId ?? null,
		keyId: args.auth.keyId ?? null,
		plan: args.auth.plan ?? null,
		mcpPeriodLimit: args.auth.mcpPeriodLimit ?? null,
		units,
	});

	if (!usage.allowed) {
		return validFalse(429, "quota_exceeded");
	}

	return validTrue({
		usage,
		plan: args.auth.plan ?? null,
	});
}
