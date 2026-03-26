import { createHash, randomInt, randomUUID } from "node:crypto";
import { BackendAvailabilityError } from "./backend-availability";
import type { BridgeSessionCredentialBundle } from "./bridge-session-auth";
import { createWebsiteBackendClient } from "./website-backend";

type DeviceSessionStatus = "pending" | "approved" | "consumed";

type DeviceSessionRecord = {
	sessionId: string;
	pollSecretHash: string;
	userCode: string;
	status: DeviceSessionStatus;
	createdAtISO: string;
	expiresAtISO: string;
	approvedAtISO?: string;
	payload?: BridgeSessionCredentialBundle;
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
	| { status: "approved"; payload: BridgeSessionCredentialBundle }
	| { status: "expired" | "consumed" | "invalid" };

type ApproveSessionResult =
	| { ok: true }
	| { ok: false; reason: "missing" | "expired" | "consumed" };

type CliDeviceSessionStore = {
	startSession(args: {
		now: Date;
		ttlMs: number;
		intervalMs: number;
	}): Promise<StartSessionResult>;
	pollSession(args: {
		sessionId: string;
		pollSecret: string;
		attempt: number;
	}): Promise<PollSessionResult>;
	approveSession(args: {
		sessionId: string;
		payload: BridgeSessionCredentialBundle;
	}): Promise<ApproveSessionResult>;
};

type CliDeviceSessionServiceOptions = {
	now?: () => Date;
	ttlMs?: number;
	intervalMs?: number;
	env?: Record<string, string | undefined>;
	store?: CliDeviceSessionStore | null;
};

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

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return fallback;
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

export class CliDeviceSessionStoreError extends BackendAvailabilityError {
	constructor(message: string) {
		super({
			message,
			code: "website_backend_unavailable",
		});
		this.name = "CliDeviceSessionStoreError";
	}
}

function createDefaultStore(
	env: Record<string, string | undefined>,
): CliDeviceSessionStore {
	const websiteBackend = createWebsiteBackendClient(env) as {
		startCliDeviceSession(args: {
			now: Date;
			ttlMs: number;
			intervalMs: number;
		}): Promise<StartSessionResult>;
		pollCliDeviceSession(args: {
			sessionId: string;
			pollSecret: string;
		}): Promise<PollSessionResult>;
		approveCliDeviceSession(args: {
			sessionId: string;
			payload: BridgeSessionCredentialBundle;
			approvedAtISO: string;
		}): Promise<ApproveSessionResult>;
	} | null;
	if (!websiteBackend) {
		throw new CliDeviceSessionStoreError(
			"Bridge session store is not configured.",
		);
	}
	return {
		startSession: async (args) =>
			await websiteBackend.startCliDeviceSession(args),
		pollSession: async (args) =>
			await websiteBackend.pollCliDeviceSession({
				sessionId: args.sessionId,
				pollSecret: args.pollSecret,
			}),
		approveSession: async (args) =>
			await websiteBackend.approveCliDeviceSession({
				sessionId: args.sessionId,
				payload: args.payload,
				approvedAtISO: new Date().toISOString(),
			}),
	};
}

export function createCliDeviceSessionService(
	options: CliDeviceSessionServiceOptions = {},
) {
	const now = options.now ?? (() => new Date());
	const ttlMs = options.ttlMs ?? 10 * 60 * 1000;
	const intervalMs = options.intervalMs ?? 3000;
	const env = options.env ?? process.env;
	const allowMemoryFallback = parseBoolean(
		env.BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK,
		resolveDeploymentEnvironment(env) !== "production",
	);
	const store =
		options.store === undefined
			? (() => {
					try {
						return createDefaultStore(env);
					} catch {
						return null;
					}
				})()
			: options.store;
	const sessions = new Map<string, DeviceSessionRecord>();
	const pollAttempts = new Map<string, number>();

	function cleanupExpired(current: Date) {
		for (const [sessionId, record] of sessions.entries()) {
			if (Date.parse(record.expiresAtISO) <= current.getTime()) {
				sessions.delete(sessionId);
				pollAttempts.delete(sessionId);
			}
		}
	}

	function requireStore(): CliDeviceSessionStore {
		if (store) {
			return store;
		}
		if (allowMemoryFallback) {
			throw new CliDeviceSessionStoreError(
				"Bardo website session store was unexpectedly unavailable during a store-backed call.",
			);
		}
		throw new CliDeviceSessionStoreError(
			"Bardo website device session store is not configured and memory fallback is disabled.",
		);
	}

	return {
		async start(): Promise<StartSessionResult> {
			const current = now();
			cleanupExpired(current);

			if (store) {
				return await requireStore().startSession({
					now: current,
					ttlMs,
					intervalMs,
				});
			}

			if (!allowMemoryFallback) {
				throw new CliDeviceSessionStoreError(
					"Bardo website device session store is not configured and memory fallback is disabled.",
				);
			}

			const sessionId = randomUUID();
			const pollSecret = randomPollSecret();
			const userCode = randomUserCode();
			const expiresAtISO = new Date(current.getTime() + ttlMs).toISOString();
			sessions.set(sessionId, {
				sessionId,
				pollSecretHash: hashSecret(pollSecret),
				userCode,
				status: "pending",
				createdAtISO: current.toISOString(),
				expiresAtISO,
			});
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

			if (store) {
				const attempt = (pollAttempts.get(args.sessionId) ?? 0) + 1;
				pollAttempts.set(args.sessionId, attempt);
				return await requireStore().pollSession({
					sessionId: args.sessionId,
					pollSecret: args.pollSecret,
					attempt,
				});
			}

			const record = sessions.get(args.sessionId) ?? null;
			if (!record) {
				return { status: "expired" };
			}
			if (record.pollSecretHash !== hashSecret(args.pollSecret)) {
				return { status: "invalid" };
			}
			if (Date.parse(record.expiresAtISO) <= current.getTime()) {
				sessions.delete(args.sessionId);
				return { status: "expired" };
			}
			if (record.status === "pending") {
				return { status: "pending", intervalMs };
			}
			if (record.status === "consumed") {
				return { status: "consumed" };
			}
			if (!record.payload) {
				return { status: "invalid" };
			}
			record.status = "consumed";
			sessions.set(args.sessionId, record);
			return { status: "approved", payload: record.payload };
		},

		async approve(args: {
			sessionId: string;
			payload: BridgeSessionCredentialBundle;
		}): Promise<ApproveSessionResult> {
			const current = now();
			cleanupExpired(current);

			if (store) {
				return await requireStore().approveSession(args);
			}

			const record = sessions.get(args.sessionId) ?? null;
			if (!record) {
				return { ok: false, reason: "missing" };
			}
			if (Date.parse(record.expiresAtISO) <= current.getTime()) {
				sessions.delete(args.sessionId);
				return { ok: false, reason: "expired" };
			}
			if (record.status === "consumed") {
				return { ok: false, reason: "consumed" };
			}
			record.status = "approved";
			record.approvedAtISO = current.toISOString();
			record.payload = args.payload;
			sessions.set(args.sessionId, record);
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
