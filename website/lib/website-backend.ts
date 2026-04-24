import { createHash, randomInt, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { get as getBlob, put as putBlob } from "@vercel/blob";
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
	| { status: "denied"; error: string }
	| { status: "expired" | "consumed" | "invalid" };

type ApproveSessionResult =
	| { ok: true }
	| { ok: false; reason: "missing" | "expired" | "consumed" };

type DenySessionResult =
	| { ok: true }
	| { ok: false; reason: "missing" | "expired" | "consumed" };

type RotateRefreshSessionResult =
	| { ok: true }
	| { ok: false; reason: "missing" | "invalid" };

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
			status: "pending" | "approved" | "consumed" | "denied";
			createdAtISO: string;
			expiresAtISO: string;
			approvedAtISO?: string;
			deniedAtISO?: string;
			denialError?: string;
			payload?: BridgeSessionCredentialBundle;
			intervalMs: number;
		}
	>;
	bridgeRefreshSessions: Record<
		string,
		{ refreshTokenHash: string; updatedAtISO: string }
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

type CliDeviceSessionRecord = BackendState["cliDeviceSessions"][string];
type BridgeRefreshSessionRecord = BackendState["bridgeRefreshSessions"][string];
type RateLimitWindowRecord = BackendState["rateLimitWindows"][string];
type CliLoginTokenRecord = BackendState["cliLoginTokens"][string];
type McpUserUsageRecord = BackendState["mcpUserUsage"][string];
type McpKeyUsageRecord = BackendState["mcpKeyUsage"][string];

type WebsiteBackendDriver = "blob" | "file";

type BackendResolution =
	| { driver: "blob"; prefix: string; token: string }
	| { driver: "file"; filePath: string };

function defaultState(): BackendState {
	return {
		rateLimitWindows: {},
		cliLoginTokens: {},
		cliDeviceSessions: {},
		bridgeRefreshSessions: {},
		mcpUserUsage: {},
		mcpKeyUsage: {},
	};
}

const writeQueues = new Map<string, Promise<void>>();

function isHostedVercel(env: Record<string, string | undefined>): boolean {
	return (
		env.VERCEL === "1" ||
		env.VERCEL_ENV === "preview" ||
		env.VERCEL_ENV === "production"
	);
}

function normalizeDriver(
	value: string | undefined,
): WebsiteBackendDriver | null {
	const normalized = value?.trim().toLowerCase();
	if (normalized === "blob" || normalized === "file") {
		return normalized;
	}
	return null;
}

function resolveBlobPrefix(env: Record<string, string | undefined>): string {
	const configured = env.BARDO_WEBSITE_BACKEND_PREFIX?.trim();
	if (configured) {
		return configured.replace(/^\/+|\/+$/g, "");
	}
	const environment =
		env.VERCEL_ENV?.trim() || env.NODE_ENV?.trim() || "development";
	return `website-backend/${environment}`;
}

function resolveBackendPath(
	env: Record<string, string | undefined>,
): string | null {
	const configured = env.BARDO_WEBSITE_BACKEND_SQLITE_PATH?.trim();
	if (configured) {
		return path.resolve(configured);
	}

	return null;
}

function resolveBackend(
	env: Record<string, string | undefined>,
): BackendResolution | null {
	const explicitDriver = normalizeDriver(env.BARDO_WEBSITE_BACKEND_DRIVER);
	const blobToken = env.BLOB_READ_WRITE_TOKEN?.trim();
	const hosted = isHostedVercel(env);

	if ((explicitDriver === "blob" || (!explicitDriver && hosted)) && blobToken) {
		return {
			driver: "blob",
			prefix: resolveBlobPrefix(env),
			token: blobToken,
		};
	}

	if (explicitDriver === "blob") {
		return null;
	}

	const filePath = resolveBackendPath(env);
	if (filePath) {
		return { driver: "file", filePath };
	}

	return null;
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

function blobPath(prefix: string, ...segments: string[]): string {
	return [prefix, ...segments].join("/").replace(/\/+/g, "/");
}

function stablePathHash(input: string): string {
	return createHash("sha256").update(input).digest("base64url");
}

async function readBlobJson<T>(
	config: Extract<BackendResolution, { driver: "blob" }>,
	pathname: string,
): Promise<T | null> {
	const result = await getBlob(pathname, {
		access: "private",
		token: config.token,
		useCache: false,
	});
	if (!result) {
		return null;
	}
	if ("text" in result && typeof result.text === "function") {
		return JSON.parse(await result.text()) as T;
	}
	if (result.statusCode !== 200 || !result.stream) {
		return null;
	}
	return JSON.parse(await new Response(result.stream).text()) as T;
}

async function writeBlobJson<T>(
	config: Extract<BackendResolution, { driver: "blob" }>,
	pathname: string,
	value: T,
): Promise<void> {
	await putBlob(pathname, JSON.stringify(value, null, 2), {
		access: "private",
		addRandomSuffix: false,
		allowOverwrite: true,
		contentType: "application/json; charset=utf-8",
		token: config.token,
	});
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
			bridgeRefreshSessions: parsed.bridgeRefreshSessions ?? {},
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

function createBlobWebsiteBackendClient(
	config: Extract<BackendResolution, { driver: "blob" }>,
) {
	const sessionPath = (sessionId: string) =>
		blobPath(config.prefix, "cli-device-sessions", `${sessionId}.json`);
	const refreshPath = (sessionId: string) =>
		blobPath(config.prefix, "bridge-refresh-sessions", `${sessionId}.json`);
	const loginTokenPath = (token: string) =>
		blobPath(
			config.prefix,
			"cli-login-tokens",
			`${stablePathHash(token)}.json`,
		);
	const rateLimitPath = (key: string) =>
		blobPath(
			config.prefix,
			"rate-limit-windows",
			`${stablePathHash(key)}.json`,
		);
	const userUsagePath = (subjectId: string) =>
		blobPath(
			config.prefix,
			"mcp-user-usage",
			`${stablePathHash(subjectId)}.json`,
		);
	const keyUsagePath = (keyId: string) =>
		blobPath(config.prefix, "mcp-key-usage", `${stablePathHash(keyId)}.json`);

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
			const pathname = rateLimitPath(key);
			const resetEpochSeconds = Math.ceil(
				(windowStartMs + args.windowMs) / 1000,
			);
			const existing = await readBlobJson<RateLimitWindowRecord>(
				config,
				pathname,
			);
			const existingExpiresAt =
				(existing?.updatedAtMs ?? 0) + Number(args.windowMs);
			const used =
				existing && existingExpiresAt > nowMs ? (existing.used ?? 0) : 0;
			const nextUsed = used + 1;
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
			await writeBlobJson<RateLimitWindowRecord>(config, pathname, {
				used: nextUsed,
				updatedAtMs: nowMs,
			});
			return {
				allowed: true,
				remaining: Math.max(0, args.limit - nextUsed),
				resetEpochSeconds,
				backend: "website" as const,
			};
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
			const pathname = loginTokenPath(args.token);
			const existing = await readBlobJson<CliLoginTokenRecord>(
				config,
				pathname,
			);
			if (existing && existing.expiresAtMs > nowMs) {
				return { ok: false, reason: "already_used" };
			}
			await writeBlobJson<CliLoginTokenRecord>(config, pathname, {
				expiresAtMs,
				usedAtMs: nowMs,
			});
			return { ok: true };
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
			await writeBlobJson<CliDeviceSessionRecord>(
				config,
				sessionPath(sessionId),
				{
					pollSecretHash: hashSecret(pollSecret),
					userCode,
					status: "pending",
					createdAtISO,
					expiresAtISO,
					intervalMs: args.intervalMs,
				},
			);
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
			const pathname = sessionPath(args.sessionId);
			const record = await readBlobJson<CliDeviceSessionRecord>(
				config,
				pathname,
			);
			if (!record) {
				return { status: "expired" };
			}
			if (record.pollSecretHash !== hashSecret(args.pollSecret)) {
				return { status: "invalid" };
			}
			if (Date.parse(record.expiresAtISO) <= Date.now()) {
				return { status: "expired" };
			}
			if (record.status === "pending") {
				return {
					status: "pending",
					intervalMs: record.intervalMs,
				};
			}
			if (record.status === "denied") {
				return {
					status: "denied",
					error: record.denialError ?? "Bridge approval was denied.",
				};
			}
			if (record.status === "consumed") {
				return { status: "consumed" };
			}
			if (!record.payload) {
				return { status: "invalid" };
			}
			await writeBlobJson<CliDeviceSessionRecord>(config, pathname, {
				...record,
				status: "consumed",
			});
			return {
				status: "approved",
				payload: record.payload,
			};
		},

		async approveCliDeviceSession(args: {
			sessionId: string;
			payload: BridgeSessionCredentialBundle;
			approvedAtISO: string;
		}): Promise<ApproveSessionResult> {
			const pathname = sessionPath(args.sessionId);
			const record = await readBlobJson<CliDeviceSessionRecord>(
				config,
				pathname,
			);
			if (!record) {
				return { ok: false, reason: "missing" };
			}
			if (Date.parse(record.expiresAtISO) <= Date.now()) {
				return { ok: false, reason: "expired" };
			}
			if (record.status === "consumed") {
				return { ok: false, reason: "consumed" };
			}
			await writeBlobJson<CliDeviceSessionRecord>(config, pathname, {
				...record,
				status: "approved",
				approvedAtISO: args.approvedAtISO,
				payload: args.payload,
			});
			await writeBlobJson<BridgeRefreshSessionRecord>(
				config,
				refreshPath(args.sessionId),
				{
					refreshTokenHash: hashSecret(args.payload.refreshToken),
					updatedAtISO: args.approvedAtISO,
				},
			);
			return { ok: true };
		},

		async denyCliDeviceSession(args: {
			sessionId: string;
			error: string;
			deniedAtISO: string;
		}): Promise<DenySessionResult> {
			const pathname = sessionPath(args.sessionId);
			const record = await readBlobJson<CliDeviceSessionRecord>(
				config,
				pathname,
			);
			if (!record) {
				return { ok: false, reason: "missing" };
			}
			if (Date.parse(record.expiresAtISO) <= Date.now()) {
				return { ok: false, reason: "expired" };
			}
			if (record.status === "consumed") {
				return { ok: false, reason: "consumed" };
			}
			await writeBlobJson<CliDeviceSessionRecord>(config, pathname, {
				...record,
				status: "denied",
				deniedAtISO: args.deniedAtISO,
				denialError: args.error,
			});
			return { ok: true };
		},

		async rotateBridgeRefreshSession(args: {
			sessionId: string;
			refreshToken: string;
			nextRefreshToken: string;
			updatedAtISO?: string;
		}): Promise<RotateRefreshSessionResult> {
			const pathname = refreshPath(args.sessionId);
			const record = await readBlobJson<BridgeRefreshSessionRecord>(
				config,
				pathname,
			);
			if (!record) {
				return { ok: false, reason: "missing" };
			}
			if (record.refreshTokenHash !== hashSecret(args.refreshToken)) {
				return { ok: false, reason: "invalid" };
			}
			await writeBlobJson<BridgeRefreshSessionRecord>(config, pathname, {
				refreshTokenHash: hashSecret(args.nextRefreshToken),
				updatedAtISO: args.updatedAtISO ?? new Date().toISOString(),
			});
			return { ok: true };
		},

		async readUserUsage(subjectId: string): Promise<UsageSnapshot> {
			const entry = await readBlobJson<McpUserUsageRecord>(
				config,
				userUsagePath(subjectId),
			);
			return {
				total: entry?.total ?? 0,
				thisPeriod: 0,
				backend: "website" as const,
			};
		},

		async readKeyUsage(args: {
			keyId: string;
			periodStartMs: number;
		}): Promise<KeyUsageSnapshot> {
			const keyUsage = await readBlobJson<McpKeyUsageRecord>(
				config,
				keyUsagePath(args.keyId),
			);
			const period = keyUsage?.byPeriod[monthBucket(args.periodStartMs)];
			return {
				total: keyUsage?.total ?? 0,
				thisPeriod: period?.total ?? 0,
				lastUsedAt: period?.lastUsedAt ?? null,
				lastUsedProviderId: period?.lastUsedProviderId ?? null,
				lastUsedModelId: period?.lastUsedModelId ?? null,
				backend: "website" as const,
			};
		},
	};
}

function createFileWebsiteBackendClient(backendPath: string) {
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
				if (record.status === "denied") {
					return {
						status: "denied" as const,
						error: record.denialError ?? "Bridge approval was denied.",
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
				state.bridgeRefreshSessions[args.sessionId] = {
					refreshTokenHash: hashSecret(args.payload.refreshToken),
					updatedAtISO: args.approvedAtISO,
				};
				return { ok: true as const };
			});
		},

		async denyCliDeviceSession(args: {
			sessionId: string;
			error: string;
			deniedAtISO: string;
		}): Promise<DenySessionResult> {
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
				record.status = "denied";
				record.deniedAtISO = args.deniedAtISO;
				record.denialError = args.error;
				return { ok: true as const };
			});
		},

		async rotateBridgeRefreshSession(args: {
			sessionId: string;
			refreshToken: string;
			nextRefreshToken: string;
			updatedAtISO?: string;
		}): Promise<RotateRefreshSessionResult> {
			return await mutateState(backendPath, (state) => {
				const record = state.bridgeRefreshSessions[args.sessionId];
				if (!record) {
					return { ok: false, reason: "missing" as const };
				}
				if (record.refreshTokenHash !== hashSecret(args.refreshToken)) {
					return { ok: false, reason: "invalid" as const };
				}
				record.refreshTokenHash = hashSecret(args.nextRefreshToken);
				record.updatedAtISO = args.updatedAtISO ?? new Date().toISOString();
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

export function createWebsiteBackendClient(
	env: Record<string, string | undefined> = process.env,
) {
	const backend = resolveBackend(env);
	if (!backend) {
		return null;
	}
	if (backend.driver === "blob") {
		return createBlobWebsiteBackendClient(backend);
	}
	return createFileWebsiteBackendClient(backend.filePath);
}
