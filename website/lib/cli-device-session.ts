import { createHash, randomUUID } from "node:crypto";
import type { CliLoginExchangePayload } from "./cli-login-token";

type DeviceSessionStatus = "pending" | "approved" | "consumed";

type DeviceSessionRecord = {
	sessionId: string;
	pollSecretHash: string;
	userCode: string;
	status: DeviceSessionStatus;
	createdAtISO: string;
	expiresAtISO: string;
	approvedAtISO?: string;
	payload?: CliLoginExchangePayload;
};

type StartSessionResult = {
	sessionId: string;
	pollSecret: string;
	userCode: string;
	expiresAtISO: string;
	intervalMs: number;
};

type PollSessionResult =
	| { status: "pending"; intervalMs: number }
	| { status: "approved"; payload: CliLoginExchangePayload }
	| { status: "expired" | "consumed" | "invalid" };

type ApproveSessionResult =
	| { ok: true }
	| { ok: false; reason: "missing" | "expired" | "consumed" };

type CliDeviceSessionServiceOptions = {
	now?: () => Date;
	ttlMs?: number;
	intervalMs?: number;
	env?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
};

type UpstashConfig = {
	url: string;
	token: string;
	timeoutMs: number;
	databaseName: string | null;
};

function hashSecret(secret: string): string {
	return createHash("sha256").update(secret).digest("base64url");
}

function randomPollSecret(): string {
	return randomUUID().replaceAll("-", "");
}

function randomUserCode(): string {
	return `${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random()
		.toString(36)
		.slice(2, 6)
		.toUpperCase()}`;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return fallback;
}

function parsePositiveInteger(
	value: string | undefined,
	fallback: number,
): number {
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.floor(parsed);
}

function resolveDeploymentEnvironment(
	env: Record<string, string | undefined>,
): "production" | "staging" | "development" {
	if (
		env.VERCEL_ENV?.trim() === "production" ||
		env.NODE_ENV === "production"
	) {
		return "production";
	}
	if (env.VERCEL_ENV?.trim() === "preview") {
		return "staging";
	}
	return "development";
}

function readUpstashConfig(
	env: Record<string, string | undefined>,
): UpstashConfig | null {
	const url =
		env.BARDO_CLI_DEVICE_SESSION_UPSTASH_REDIS_REST_URL?.trim() ||
		env.UPSTASH_REDIS_REST_URL?.trim();
	const token =
		env.BARDO_CLI_DEVICE_SESSION_UPSTASH_REDIS_REST_TOKEN?.trim() ||
		env.UPSTASH_REDIS_REST_TOKEN?.trim();
	const databaseName =
		env.BARDO_CLI_DEVICE_SESSION_UPSTASH_DATABASE_NAME?.trim() ||
		env.UPSTASH_REDIS_DATABASE_NAME?.trim() ||
		null;

	if (!url && !token && !databaseName) {
		return null;
	}
	if (!url || !token) {
		throw new CliDeviceSessionStoreError(
			"CLI device session store requires both Upstash REST URL and token.",
		);
	}

	const environment = resolveDeploymentEnvironment(env);
	if (environment !== "production" && databaseName !== "bardo-staging") {
		throw new CliDeviceSessionStoreError(
			"Non-production CLI device session store must use the bardo-staging Upstash database.",
		);
	}

	return {
		url: url.replace(/\/+$/, ""),
		token,
		timeoutMs: parsePositiveInteger(env.BARDO_UPSTASH_TIMEOUT_MS, 1200),
		databaseName,
	};
}

function sessionKey(sessionId: string): string {
	return `bardo:cli-device-session:${sessionId}`;
}

function consumedKey(sessionId: string): string {
	return `bardo:cli-device-session:consumed:${sessionId}`;
}

async function upstashRequest(args: {
	config: UpstashConfig;
	fetchImpl: typeof fetch;
	pathname: string;
}): Promise<unknown> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), args.config.timeoutMs);
	try {
		const response = await args.fetchImpl(
			`${args.config.url}${args.pathname}`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${args.config.token}`,
				},
				signal: controller.signal,
			},
		);
		if (!response.ok) {
			throw new CliDeviceSessionStoreError(
				`Upstash CLI device session request failed with status ${response.status}.`,
			);
		}
		const payload = (await response.json()) as { result?: unknown };
		return payload.result;
	} catch (error) {
		if (error instanceof CliDeviceSessionStoreError) {
			throw error;
		}
		throw new CliDeviceSessionStoreError(
			`CLI device session request failed: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	} finally {
		clearTimeout(timeout);
	}
}

async function upstashSetRecord(args: {
	config: UpstashConfig;
	fetchImpl: typeof fetch;
	key: string;
	record: DeviceSessionRecord;
	ttlSeconds: number;
	mode?: "NX" | "XX";
}): Promise<"stored" | "missing"> {
	const encoded = encodeURIComponent(JSON.stringify(args.record));
	const suffix = args.mode ? `/${args.mode}` : "";
	const result = await upstashRequest({
		config: args.config,
		fetchImpl: args.fetchImpl,
		pathname: `/set/${encodeURIComponent(args.key)}/${encoded}${suffix}/EX/${args.ttlSeconds}`,
	});
	if (result === "OK") {
		return "stored";
	}
	if (result === null) {
		return "missing";
	}
	throw new CliDeviceSessionStoreError(
		"Upstash CLI device session store returned an unexpected SET response.",
	);
}

async function upstashGetRecord(args: {
	config: UpstashConfig;
	fetchImpl: typeof fetch;
	key: string;
}): Promise<DeviceSessionRecord | null> {
	const result = await upstashRequest({
		config: args.config,
		fetchImpl: args.fetchImpl,
		pathname: `/get/${encodeURIComponent(args.key)}`,
	});
	if (result === null) {
		return null;
	}
	if (typeof result !== "string") {
		throw new CliDeviceSessionStoreError(
			"Upstash CLI device session store returned an unexpected GET response.",
		);
	}
	const parsed = JSON.parse(result) as Partial<DeviceSessionRecord>;
	if (
		typeof parsed.sessionId !== "string" ||
		typeof parsed.pollSecretHash !== "string" ||
		typeof parsed.userCode !== "string" ||
		typeof parsed.status !== "string" ||
		typeof parsed.createdAtISO !== "string" ||
		typeof parsed.expiresAtISO !== "string"
	) {
		throw new CliDeviceSessionStoreError(
			"Upstash CLI device session store returned an invalid record.",
		);
	}
	return parsed as DeviceSessionRecord;
}

async function upstashConsumeMarker(args: {
	config: UpstashConfig;
	fetchImpl: typeof fetch;
	key: string;
	ttlSeconds: number;
}): Promise<boolean> {
	const result = await upstashRequest({
		config: args.config,
		fetchImpl: args.fetchImpl,
		pathname: `/set/${encodeURIComponent(args.key)}/1/NX/EX/${args.ttlSeconds}`,
	});
	if (result === "OK") {
		return true;
	}
	if (result === null) {
		return false;
	}
	throw new CliDeviceSessionStoreError(
		"Upstash CLI device session store returned an unexpected consume response.",
	);
}

async function upstashDeleteKey(args: {
	config: UpstashConfig;
	fetchImpl: typeof fetch;
	key: string;
}): Promise<void> {
	await upstashRequest({
		config: args.config,
		fetchImpl: args.fetchImpl,
		pathname: `/del/${encodeURIComponent(args.key)}`,
	});
}

export class CliDeviceSessionStoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CliDeviceSessionStoreError";
	}
}

export function createCliDeviceSessionService(
	options: CliDeviceSessionServiceOptions = {},
) {
	const now = options.now ?? (() => new Date());
	const ttlMs = options.ttlMs ?? 10 * 60 * 1000;
	const intervalMs = options.intervalMs ?? 3000;
	const env = options.env ?? process.env;
	const fetchImpl = options.fetchImpl ?? fetch;
	const allowMemoryFallback = parseBoolean(
		env.BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK,
		resolveDeploymentEnvironment(env) !== "production",
	);
	const sessions = new Map<string, DeviceSessionRecord>();

	function cleanupExpired(current: Date) {
		for (const [sessionId, record] of sessions.entries()) {
			if (Date.parse(record.expiresAtISO) <= current.getTime()) {
				sessions.delete(sessionId);
			}
		}
	}

	function ttlSecondsFor(expiresAtISO: string, currentMs: number): number {
		return Math.max(
			1,
			Math.ceil((Date.parse(expiresAtISO) - currentMs) / 1000),
		);
	}

	function resolveUpstashConfig(): UpstashConfig | null {
		return readUpstashConfig(env);
	}

	return {
		async start(): Promise<StartSessionResult> {
			const current = now();
			cleanupExpired(current);
			const expiresAtISO = new Date(current.getTime() + ttlMs).toISOString();
			const config = resolveUpstashConfig();
			const sessionId = randomUUID();
			const pollSecret = randomPollSecret();
			const userCode = randomUserCode();
			const record: DeviceSessionRecord = {
				sessionId,
				pollSecretHash: hashSecret(pollSecret),
				userCode,
				status: "pending",
				createdAtISO: current.toISOString(),
				expiresAtISO,
			};

			if (config) {
				const result = await upstashSetRecord({
					config,
					fetchImpl,
					key: sessionKey(sessionId),
					record,
					ttlSeconds: ttlSecondsFor(expiresAtISO, current.getTime()),
					mode: "NX",
				});
				if (result !== "stored") {
					throw new CliDeviceSessionStoreError(
						"Failed to persist the CLI device session.",
					);
				}
			} else {
				if (!allowMemoryFallback) {
					throw new CliDeviceSessionStoreError(
						"CLI device session store is not configured with Upstash and memory fallback is disabled.",
					);
				}
				sessions.set(sessionId, record);
			}

			return {
				sessionId,
				pollSecret,
				userCode,
				expiresAtISO,
				intervalMs,
			};
		},
		async poll(args: {
			sessionId: string;
			pollSecret: string;
		}): Promise<PollSessionResult> {
			const current = now();
			cleanupExpired(current);
			const config = resolveUpstashConfig();
			const record = config
				? await upstashGetRecord({
						config,
						fetchImpl,
						key: sessionKey(args.sessionId),
					})
				: (sessions.get(args.sessionId) ?? null);

			if (!record) {
				return { status: "expired" };
			}
			if (record.pollSecretHash !== hashSecret(args.pollSecret)) {
				return { status: "invalid" };
			}
			if (Date.parse(record.expiresAtISO) <= current.getTime()) {
				if (config) {
					await upstashDeleteKey({
						config,
						fetchImpl,
						key: sessionKey(args.sessionId),
					});
				} else {
					sessions.delete(args.sessionId);
				}
				return { status: "expired" };
			}
			if (record.status === "pending") {
				return { status: "pending", intervalMs };
			}
			if (!record.payload) {
				return { status: "invalid" };
			}

			if (config) {
				const consumed = await upstashConsumeMarker({
					config,
					fetchImpl,
					key: consumedKey(args.sessionId),
					ttlSeconds: ttlSecondsFor(record.expiresAtISO, current.getTime()),
				});
				if (!consumed) {
					return { status: "consumed" };
				}
				record.status = "consumed";
				await upstashSetRecord({
					config,
					fetchImpl,
					key: sessionKey(args.sessionId),
					record,
					ttlSeconds: ttlSecondsFor(record.expiresAtISO, current.getTime()),
					mode: "XX",
				});
			} else {
				if (record.status === "consumed") {
					return { status: "consumed" };
				}
				record.status = "consumed";
				sessions.set(args.sessionId, record);
			}

			return {
				status: "approved",
				payload: record.payload,
			};
		},
		async approve(args: {
			sessionId: string;
			payload: CliLoginExchangePayload;
		}): Promise<ApproveSessionResult> {
			const current = now();
			cleanupExpired(current);
			const config = resolveUpstashConfig();
			const record = config
				? await upstashGetRecord({
						config,
						fetchImpl,
						key: sessionKey(args.sessionId),
					})
				: (sessions.get(args.sessionId) ?? null);
			if (!record) {
				return { ok: false, reason: "missing" };
			}
			if (Date.parse(record.expiresAtISO) <= current.getTime()) {
				if (config) {
					await upstashDeleteKey({
						config,
						fetchImpl,
						key: sessionKey(args.sessionId),
					});
				} else {
					sessions.delete(args.sessionId);
				}
				return { ok: false, reason: "expired" };
			}
			if (record.status === "consumed") {
				return { ok: false, reason: "consumed" };
			}

			record.status = "approved";
			record.approvedAtISO = current.toISOString();
			record.payload = args.payload;

			if (config) {
				const result = await upstashSetRecord({
					config,
					fetchImpl,
					key: sessionKey(args.sessionId),
					record,
					ttlSeconds: ttlSecondsFor(record.expiresAtISO, current.getTime()),
					mode: "XX",
				});
				if (result !== "stored") {
					return { ok: false, reason: "missing" };
				}
			} else {
				sessions.set(args.sessionId, record);
			}

			return { ok: true };
		},
	};
}

let defaultCliDeviceSessionService: ReturnType<
	typeof createCliDeviceSessionService
> | null = null;

export function getDefaultCliDeviceSessionService() {
	defaultCliDeviceSessionService ??= createCliDeviceSessionService();
	return defaultCliDeviceSessionService;
}
