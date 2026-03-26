import { createHash, randomInt, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BridgeSessionCredentialBundle } from "./bridge-session-auth";

type RateLimitBudget = {
	allowed: boolean;
	remaining?: number;
	retryAfterSeconds?: number;
	resetEpochSeconds?: number;
	backend: "website";
};

type LoginConsumeResult =
	| { ok: true }
	| { ok: false; reason: "expired" | "already_used" };

type PollSessionResult =
	| { status: "pending"; intervalMs: number }
	| { status: "approved"; payload: BridgeSessionCredentialBundle }
	| { status: "expired" | "consumed" | "invalid" };

type ApproveSessionResult =
	| { ok: true }
	| { ok: false; reason: "missing" | "expired" | "consumed" };

type UsageSnapshot = {
	total: number;
	thisPeriod: number;
	backend: "website";
};

type KeyUsageSnapshot = UsageSnapshot & {
	lastUsedAt: number | null;
	lastUsedProviderId: string | null;
	lastUsedModelId: string | null;
};

type BackendState = {
	rateLimitWindows: Record<string, { used: number; updatedAtMs: number }>;
	cliLoginTokens: Record<string, { expiresAtMs: number; usedAtMs: number }>;
	cliDeviceSessions: Record<
		string,
		{
			pollSecretHash: string;
			userCode: string;
			status: "pending" | "approved" | "consumed";
			createdAtISO: string;
			expiresAtISO: string;
			approvedAtISO?: string;
			payload?: BridgeSessionCredentialBundle;
			intervalMs: number;
		}
	>;
	mcpUserUsage: Record<
		string,
		{ total: number; byPeriod: Record<string, number> }
	>;
	mcpKeyUsage: Record<
		string,
		{
			total: number;
			byPeriod: Record<
				string,
				{
					total: number;
					lastUsedAt: number | null;
					lastUsedProviderId: string | null;
					lastUsedModelId: string | null;
				}
			>;
		}
	>;
};

function defaultState(): BackendState {
	return {
		rateLimitWindows: {},
		cliLoginTokens: {},
		cliDeviceSessions: {},
		mcpUserUsage: {},
		mcpKeyUsage: {},
	};
}

const writeQueues = new Map<string, Promise<void>>();

function resolveBackendPath(
	env: Record<string, string | undefined>,
): string | null {
	const configured = env.BARDO_WEBSITE_BACKEND_SQLITE_PATH?.trim();
	if (!configured) {
		return null;
	}
	return path.resolve(configured);
}

function ensureParent(filePath: string): void {
	mkdirSync(path.dirname(filePath), { recursive: true });
}

function hashSecret(secret: string): string {
	return createHash("sha256").update(secret).digest("base64url");
}

function randomPollSecret(): string {
	return randomUUID().replaceAll("-", "");
}

function randomUserCode(): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	const createSegment = () =>
		Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join(
			"",
		);
	return `${createSegment()}-${createSegment()}`;
}

function monthBucket(timestampMs: number): string {
	return new Date(timestampMs).toISOString().slice(0, 7);
}

function pruneExpiredRateLimitWindows(
	state: BackendState,
	nowMs: number,
): void {
	for (const [key, value] of Object.entries(state.rateLimitWindows)) {
		const segments = key.split(":");
		const windowStartRaw = segments.at(-2);
		const windowMsRaw = segments.at(-1);
		const windowStartMs = Number(windowStartRaw);
		const windowMs = Number(windowMsRaw);
		const fallbackExpiryMs =
			(value.updatedAtMs || 0) + (Number.isFinite(windowMs) ? windowMs : 0);
		const expiresAtMs =
			Number.isFinite(windowStartMs) && Number.isFinite(windowMs)
				? windowStartMs + windowMs
				: fallbackExpiryMs;
		if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
			delete state.rateLimitWindows[key];
		}
	}
}

function readState(filePath: string): BackendState {
	try {
		const raw = readFileSync(filePath, "utf8");
		const parsed = JSON.parse(raw) as Partial<BackendState>;
		return {
			rateLimitWindows: parsed.rateLimitWindows ?? {},
			cliLoginTokens: parsed.cliLoginTokens ?? {},
			cliDeviceSessions: parsed.cliDeviceSessions ?? {},
			mcpUserUsage: parsed.mcpUserUsage ?? {},
			mcpKeyUsage: parsed.mcpKeyUsage ?? {},
		};
	} catch {
		return defaultState();
	}
}

function writeState(filePath: string, state: BackendState): void {
	ensureParent(filePath);
	const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(tempPath, JSON.stringify(state, null, 2), {
		encoding: "utf8",
		mode: 0o600,
	});
	renameSync(tempPath, filePath);
}

async function mutateState<TResult>(
	filePath: string,
	mutator: (state: BackendState) => TResult,
): Promise<TResult> {
	const previous = writeQueues.get(filePath) ?? Promise.resolve();
	let release!: () => void;
	const next = new Promise<void>((resolve) => {
		release = resolve;
	});
	writeQueues.set(
		filePath,
		previous.finally(() => next).catch(() => next),
	);

	await previous.catch(() => undefined);
	try {
		const state = readState(filePath);
		const result = mutator(state);
		writeState(filePath, state);
		return result;
	} finally {
		release();
		if (writeQueues.get(filePath) === next) {
			writeQueues.delete(filePath);
		}
	}
}

async function readSnapshot<TResult>(
	filePath: string,
	reader: (state: BackendState) => TResult,
): Promise<TResult> {
	const pending = writeQueues.get(filePath);
	if (pending) {
		await pending.catch(() => undefined);
	}
	return reader(readState(filePath));
}

export function createWebsiteBackendClient(
	env: Record<string, string | undefined> = process.env,
) {
	const backendPath = resolveBackendPath(env);
	if (!backendPath) {
		return null;
	}

	return {
		async consumeRateLimitWindow(args: {
			scope: string;
			counterKey: string;
			limit: number;
			windowMs: number;
			nowMs?: number;
		}): Promise<RateLimitBudget> {
			const nowMs = args.nowMs ?? Date.now();
			const windowStartMs = Math.floor(nowMs / args.windowMs) * args.windowMs;
			const key = [
				args.scope,
				args.counterKey,
				String(windowStartMs),
				String(args.windowMs),
			].join(":");
			return await mutateState(backendPath, (state) => {
				pruneExpiredRateLimitWindows(state, nowMs);
				const existing = state.rateLimitWindows[key];
				const nextUsed = (existing?.used ?? 0) + 1;
				const resetEpochSeconds = Math.ceil(
					(windowStartMs + args.windowMs) / 1000,
				);
				if (nextUsed > args.limit) {
					return {
						allowed: false,
						remaining: 0,
						retryAfterSeconds: Math.max(
							1,
							Math.ceil((windowStartMs + args.windowMs - nowMs) / 1000),
						),
						resetEpochSeconds,
						backend: "website" as const,
					};
				}
				state.rateLimitWindows[key] = {
					used: nextUsed,
					updatedAtMs: nowMs,
				};
				return {
					allowed: true,
					remaining: Math.max(0, args.limit - nextUsed),
					resetEpochSeconds,
					backend: "website" as const,
				};
			});
		},

		async consumeCliLoginToken(args: {
			token: string;
			expiresAtISO: string;
			nowMs?: number;
		}): Promise<LoginConsumeResult> {
			const nowMs = args.nowMs ?? Date.now();
			const expiresAtMs = Date.parse(args.expiresAtISO);
			if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
				return { ok: false, reason: "expired" };
			}
			return await mutateState(backendPath, (state) => {
				const existing = state.cliLoginTokens[args.token];
				if (existing && existing.expiresAtMs > nowMs) {
					return { ok: false, reason: "already_used" as const };
				}
				state.cliLoginTokens[args.token] = {
					expiresAtMs,
					usedAtMs: nowMs,
				};
				return { ok: true as const };
			});
		},

		async startCliDeviceSession(args: {
			now: Date;
			ttlMs: number;
			intervalMs: number;
		}) {
			const sessionId = randomUUID();
			const pollSecret = randomPollSecret();
			const userCode = randomUserCode();
			const createdAtISO = args.now.toISOString();
			const expiresAtISO = new Date(
				args.now.getTime() + args.ttlMs,
			).toISOString();
			await mutateState(backendPath, (state) => {
				state.cliDeviceSessions[sessionId] = {
					pollSecretHash: hashSecret(pollSecret),
					userCode,
					status: "pending",
					createdAtISO,
					expiresAtISO,
					intervalMs: args.intervalMs,
				};
			});
			return {
				sessionId,
				pollSecret,
				userCode,
				expiresAtISO,
				intervalMs: args.intervalMs,
			};
		},

		async pollCliDeviceSession(args: {
			sessionId: string;
			pollSecret: string;
		}): Promise<PollSessionResult> {
			return await mutateState(backendPath, (state) => {
				const record = state.cliDeviceSessions[args.sessionId];
				if (!record) {
					return { status: "expired" as const };
				}
				if (record.pollSecretHash !== hashSecret(args.pollSecret)) {
					return { status: "invalid" as const };
				}
				if (Date.parse(record.expiresAtISO) <= Date.now()) {
					return { status: "expired" as const };
				}
				if (record.status === "pending") {
					return {
						status: "pending" as const,
						intervalMs: record.intervalMs,
					};
				}
				if (record.status === "consumed") {
					return { status: "consumed" as const };
				}
				if (!record.payload) {
					return { status: "invalid" as const };
				}
				record.status = "consumed";
				return {
					status: "approved" as const,
					payload: record.payload,
				};
			});
		},

		async approveCliDeviceSession(args: {
			sessionId: string;
			payload: BridgeSessionCredentialBundle;
			approvedAtISO: string;
		}): Promise<ApproveSessionResult> {
			return await mutateState(backendPath, (state) => {
				const record = state.cliDeviceSessions[args.sessionId];
				if (!record) {
					return { ok: false, reason: "missing" as const };
				}
				if (Date.parse(record.expiresAtISO) <= Date.now()) {
					return { ok: false, reason: "expired" as const };
				}
				if (record.status === "consumed") {
					return { ok: false, reason: "consumed" as const };
				}
				record.status = "approved";
				record.approvedAtISO = args.approvedAtISO;
				record.payload = args.payload;
				return { ok: true as const };
			});
		},

		async readUserUsage(subjectId: string): Promise<UsageSnapshot> {
			return await readSnapshot(backendPath, (state) => {
				const entry = state.mcpUserUsage[subjectId];
				return {
					total: entry?.total ?? 0,
					thisPeriod: 0,
					backend: "website" as const,
				};
			});
		},

		async readKeyUsage(args: {
			keyId: string;
			periodStartMs: number;
		}): Promise<KeyUsageSnapshot> {
			return await readSnapshot(backendPath, (state) => {
				const keyUsage = state.mcpKeyUsage[args.keyId];
				const period = keyUsage?.byPeriod[monthBucket(args.periodStartMs)];
				return {
					total: keyUsage?.total ?? 0,
					thisPeriod: period?.total ?? 0,
					lastUsedAt: period?.lastUsedAt ?? null,
					lastUsedProviderId: period?.lastUsedProviderId ?? null,
					lastUsedModelId: period?.lastUsedModelId ?? null,
					backend: "website" as const,
				};
			});
		},
	};
}
