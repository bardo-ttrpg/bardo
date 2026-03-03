import { createHash } from "node:crypto";

type ConsumeArgs = {
	token: string;
	expiresAtISO: string;
};

type ConsumeResult =
	| { ok: true }
	| { ok: false; reason: "expired" | "already_used" };

type CliLoginTokenStoreOptions = {
	nowMs?: () => number;
	env?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
};

type UpstashConfig = {
	url: string;
	token: string;
	timeoutMs: number;
	databaseName: string | null;
};

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
		env.BARDO_CLI_LOGIN_UPSTASH_REDIS_REST_URL?.trim() ||
		env.UPSTASH_REDIS_REST_URL?.trim();
	const token =
		env.BARDO_CLI_LOGIN_UPSTASH_REDIS_REST_TOKEN?.trim() ||
		env.UPSTASH_REDIS_REST_TOKEN?.trim();
	const databaseName =
		env.BARDO_CLI_LOGIN_UPSTASH_DATABASE_NAME?.trim() ||
		env.UPSTASH_REDIS_DATABASE_NAME?.trim() ||
		null;

	if (!url && !token && !databaseName) {
		return null;
	}
	if (!url || !token) {
		throw new CliLoginReplayStoreError(
			"CLI login replay store requires both Upstash REST URL and token.",
		);
	}
	const environment = resolveDeploymentEnvironment(env);
	if (environment !== "production" && databaseName !== "bardo-staging") {
		throw new CliLoginReplayStoreError(
			"Non-production CLI login replay store must use the bardo-staging Upstash database.",
		);
	}

	return {
		url: url.replace(/\/+$/, ""),
		token,
		timeoutMs: parsePositiveInteger(env.BARDO_UPSTASH_TIMEOUT_MS, 1200),
		databaseName,
	};
}

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("base64url");
}

function replayKey(token: string): string {
	return `bardo:cli-login:replay:${hashToken(token)}`;
}

function pruneExpiredTokens(
	usedTokens: Map<string, number>,
	current: number,
): void {
	for (const [key, expiresAt] of usedTokens.entries()) {
		if (expiresAt <= current) {
			usedTokens.delete(key);
		}
	}
}

async function consumeWithUpstash(args: {
	key: string;
	config: UpstashConfig;
	fetchImpl: typeof fetch;
	ttlSeconds: number;
}): Promise<ConsumeResult> {
	const endpoint = `${args.config.url}/set/${encodeURIComponent(args.key)}/1/NX/EX/${args.ttlSeconds}`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), args.config.timeoutMs);
	try {
		const response = await args.fetchImpl(endpoint, {
			method: "POST",
			headers: {
				authorization: `Bearer ${args.config.token}`,
			},
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new CliLoginReplayStoreError(
				`Upstash replay store request failed with status ${response.status}.`,
			);
		}
		const payload = (await response.json()) as { result?: unknown };
		if (payload.result === "OK") {
			return { ok: true };
		}
		if (payload.result === null) {
			return { ok: false, reason: "already_used" };
		}
		throw new CliLoginReplayStoreError(
			"Upstash replay store returned an unexpected response.",
		);
	} catch (error) {
		if (error instanceof CliLoginReplayStoreError) {
			throw error;
		}
		const message = error instanceof Error ? error.message : String(error);
		throw new CliLoginReplayStoreError(
			`CLI login replay store request failed: ${message}`,
		);
	} finally {
		clearTimeout(timeout);
	}
}

export class CliLoginReplayStoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CliLoginReplayStoreError";
	}
}

export function createCliLoginTokenStore(
	options: CliLoginTokenStoreOptions = {},
) {
	const now = options.nowMs ?? (() => Date.now());
	const env = options.env ?? process.env;
	const fetchImpl = options.fetchImpl ?? fetch;
	const usedTokens = new Map<string, number>();
	const allowMemoryFallback = parseBoolean(
		env.BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK,
		resolveDeploymentEnvironment(env) !== "production",
	);

	return {
		async consume(args: ConsumeArgs): Promise<ConsumeResult> {
			const expiresAt = Date.parse(args.expiresAtISO);
			const current = now();
			if (!Number.isFinite(expiresAt) || expiresAt <= current) {
				return { ok: false, reason: "expired" };
			}

			const ttlSeconds = Math.max(1, Math.ceil((expiresAt - current) / 1000));
			const config = readUpstashConfig(env);
			if (config) {
				return consumeWithUpstash({
					key: replayKey(args.token.trim()),
					config,
					fetchImpl,
					ttlSeconds,
				});
			}
			if (!allowMemoryFallback) {
				throw new CliLoginReplayStoreError(
					"CLI login replay store is not configured with Upstash and memory fallback is disabled.",
				);
			}

			pruneExpiredTokens(usedTokens, current);
			const key = hashToken(args.token.trim());
			const existingExpiry = usedTokens.get(key);
			if (typeof existingExpiry === "number" && existingExpiry > current) {
				return { ok: false, reason: "already_used" };
			}

			usedTokens.set(key, expiresAt);
			return { ok: true };
		},
		reset(): void {
			usedTokens.clear();
		},
	};
}
