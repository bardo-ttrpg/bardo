import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	appendPendingUsageEntry,
	buildPendingBatch,
	clearPendingUsageEntries,
	loadPendingUsageEntries,
	sha256,
} from "./auth-pending-log";

type FetchLike = typeof fetch;

type ValidateResponse = {
	valid: boolean;
	remaining_quota?: unknown;
	plan?: unknown;
	reason?: unknown;
};

type AuthCache = {
	key_hash: string;
	validated_at: number;
	ttl_ms: number;
	plan: string | null;
	quota_remaining: number;
};

type ValidateAndMeterResult = {
	remainingQuota: number | null;
	plan: string | null;
	usedCachedGrace: boolean;
};

const EXPLICIT_DENY_REASONS = new Set([
	"invalid_key",
	"expired",
	"quota_exceeded",
	"denied",
]);

function isExplicitDenyError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	if (EXPLICIT_DENY_REASONS.has(error.message)) {
		return true;
	}
	if (!error.message.startsWith("validate_and_meter_failed:")) {
		return false;
	}
	const reason = error.message.slice("validate_and_meter_failed:".length);
	return EXPLICIT_DENY_REASONS.has(reason);
}

function parseCache(value: unknown): AuthCache | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	const record = value as Record<string, unknown>;
	if (
		typeof record.key_hash !== "string" ||
		typeof record.validated_at !== "number" ||
		typeof record.ttl_ms !== "number" ||
		typeof record.quota_remaining !== "number"
	) {
		return null;
	}
	return {
		key_hash: record.key_hash,
		validated_at: record.validated_at,
		ttl_ms: record.ttl_ms,
		plan: typeof record.plan === "string" ? record.plan : null,
		quota_remaining: Math.max(0, Math.floor(record.quota_remaining)),
	};
}

async function readCache(cachePath: string): Promise<AuthCache | null> {
	const raw = await readFile(cachePath, "utf8").catch((error: unknown) => {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return null;
		}
		throw error;
	});
	if (!raw) {
		return null;
	}
	try {
		return parseCache(JSON.parse(raw));
	} catch {
		return null;
	}
}

async function writeCache(cachePath: string, cache: AuthCache): Promise<void> {
	const tempPath = `${cachePath}.${Date.now()}.tmp`;
	await mkdir(path.dirname(cachePath), { recursive: true });
	await writeFile(tempPath, JSON.stringify(cache, null, 2), {
		encoding: "utf8",
		mode: 0o600,
	});
	await rename(tempPath, cachePath);
}

async function clearCache(cachePath: string): Promise<void> {
	await rm(cachePath, { force: true });
}

function isFreshCache(
	cache: AuthCache,
	nowMs: number,
	keyHash: string,
): boolean {
	if (cache.key_hash !== keyHash) {
		return false;
	}
	const expiresAt = cache.validated_at + cache.ttl_ms;
	return expiresAt > nowMs;
}

function parseValidateResponse(payload: unknown): ValidateResponse | null {
	if (typeof payload !== "object" || payload === null) {
		return null;
	}
	const record = payload as Record<string, unknown>;
	if (typeof record.valid !== "boolean") {
		return null;
	}
	return {
		valid: record.valid,
		remaining_quota: record.remaining_quota,
		plan: record.plan,
		reason: record.reason,
	};
}

async function postValidateRequest(args: {
	fetchImpl: FetchLike;
	url: string;
	apiKey: string;
	nowMs: number;
	body: Record<string, unknown>;
}): Promise<Response> {
	return await args.fetchImpl(args.url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${args.apiKey}`,
			"x-bardo-timestamp": String(args.nowMs),
		},
		body: JSON.stringify(args.body),
	});
}

export function createValidateAndMeterClient(args: {
	apiKey: string;
	workspaceId: string;
	websiteMeteringUrl: string;
	cachePath?: string;
	pendingPath?: string;
	cacheTtlMs?: number;
	nowMs?: () => number;
	fetchImpl?: FetchLike;
	env?: Record<string, string | undefined>;
}) {
	const cachePath =
		args.cachePath ?? path.join(os.homedir(), ".bardo", "auth-cache.json");
	const pendingPath =
		args.pendingPath ??
		path.join(os.homedir(), ".bardo", "auth-cache-pending.ndjson");
	const cacheTtlMs = args.cacheTtlMs ?? 3_600_000;
	const now = args.nowMs ?? (() => Date.now());
	const fetchImpl = args.fetchImpl ?? fetch;
	const keyHash = sha256(args.apiKey);
	const env = args.env ?? process.env;
	const allowCachedGrace = env.NODE_ENV !== "production";

	async function submitPendingIfAny(nowMsValue: number): Promise<void> {
		const entries = await loadPendingUsageEntries({ pendingPath });
		if (entries.length < 1) {
			return;
		}
		const batch = buildPendingBatch({
			keyHash,
			workspaceId: args.workspaceId,
			entries,
		});
		const response = await postValidateRequest({
			fetchImpl,
			url: args.websiteMeteringUrl,
			apiKey: args.apiKey,
			nowMs: nowMsValue,
			body: {
				workspace_id: args.workspaceId,
				reconciliation: {
					batch_id: batch.batch_id,
					entries: batch.entries,
				},
			},
		});
		const payload = parseValidateResponse(
			await response.json().catch(() => null),
		);
		if (!response.ok || !payload || payload.valid !== true) {
			const reason =
				payload && typeof payload.reason === "string"
					? payload.reason
					: `http_${response.status}`;
			throw new Error(`pending_reconciliation_failed:${reason}`);
		}
		await clearPendingUsageEntries({ pendingPath });
		const remainingQuota =
			typeof payload.remaining_quota === "number"
				? Math.max(0, Math.floor(payload.remaining_quota))
				: 0;
		await writeCache(cachePath, {
			key_hash: keyHash,
			validated_at: nowMsValue,
			ttl_ms: cacheTtlMs,
			plan: typeof payload.plan === "string" ? payload.plan : null,
			quota_remaining: remainingQuota,
		});
	}

	return {
		async validateAndMeter(input: {
			tool: string;
			action: string;
		}): Promise<ValidateAndMeterResult> {
			const nowMsValue = now();
			const cached = await readCache(cachePath);
			try {
				// v6 rule: submit pending usage before validating the current call.
				await submitPendingIfAny(nowMsValue);

				const response = await postValidateRequest({
					fetchImpl,
					url: args.websiteMeteringUrl,
					apiKey: args.apiKey,
					nowMs: nowMsValue,
					body: {
						tool: input.tool,
						action: input.action,
						workspace_id: args.workspaceId,
					},
				});
				const payload = parseValidateResponse(
					await response.json().catch(() => null),
				);
				if (!response.ok || !payload) {
					if (response.status === 401) {
						await clearCache(cachePath);
					}
					const reason =
						payload && typeof payload.reason === "string"
							? payload.reason
							: `http_${response.status}`;
					throw new Error(`validate_and_meter_failed:${reason}`);
				}
				if (!payload.valid) {
					const reason =
						typeof payload.reason === "string" ? payload.reason : "denied";
					if (reason === "invalid_key" || reason === "expired") {
						await clearCache(cachePath);
					}
					throw new Error(reason);
				}

				const remainingQuota =
					typeof payload.remaining_quota === "number"
						? Math.max(0, Math.floor(payload.remaining_quota))
						: 0;
				const plan = typeof payload.plan === "string" ? payload.plan : null;
				await writeCache(cachePath, {
					key_hash: keyHash,
					validated_at: nowMsValue,
					ttl_ms: cacheTtlMs,
					plan,
					quota_remaining: remainingQuota,
				});

				return {
					remainingQuota,
					plan,
					usedCachedGrace: false,
				};
			} catch (error) {
				if (error instanceof Error && error.message.startsWith("pending_")) {
					throw error;
				}
				if (isExplicitDenyError(error)) {
					throw error;
				}
				if (
					allowCachedGrace &&
					cached &&
					isFreshCache(cached, nowMsValue, keyHash)
				) {
					if (cached.quota_remaining < 1) {
						throw new Error("quota_exceeded");
					}
					const nextRemaining = Math.max(0, cached.quota_remaining - 1);
					await writeCache(cachePath, {
						...cached,
						quota_remaining: nextRemaining,
					});
					await appendPendingUsageEntry({
						pendingPath,
						keyHash,
						workspaceId: args.workspaceId,
						ts: nowMsValue,
						tool: input.tool,
						action: input.action,
						units: 1,
					});
					return {
						remainingQuota: nextRemaining,
						plan: cached.plan,
						usedCachedGrace: true,
					};
				}
				throw new Error(
					`validate_and_meter_unavailable:${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		},
	};
}
