import { BackendAvailabilityError } from "./backend-availability";
import { createWebsiteBackendClient } from "./website-backend";

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
	store?: {
		consumeCliLoginToken(args: {
			token: string;
			expiresAtISO: string;
			nowMs?: number;
		}): Promise<ConsumeResult>;
	} | null;
};

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

function consumeWithMemory(args: {
	usedTokens: Map<string, number>;
	token: string;
	expiresAt: number;
	current: number;
}): ConsumeResult {
	pruneExpiredTokens(args.usedTokens, args.current);
	const existingExpiry = args.usedTokens.get(args.token);
	if (typeof existingExpiry === "number" && existingExpiry > args.current) {
		return { ok: false, reason: "already_used" };
	}

	args.usedTokens.set(args.token, args.expiresAt);
	return { ok: true };
}

class CliLoginReplayStoreError extends BackendAvailabilityError {
	constructor(message: string) {
		super({
			message,
			code: "website_backend_unavailable",
		});
		this.name = "CliLoginReplayStoreError";
	}
}

export function createCliLoginTokenStore(
	options: CliLoginTokenStoreOptions = {},
) {
	const now = options.nowMs ?? (() => Date.now());
	const env = options.env ?? process.env;
	const usedTokens = new Map<string, number>();
	const allowMemoryFallback = parseBoolean(
		env.BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK,
		resolveDeploymentEnvironment(env) !== "production",
	);
	const store =
		options.store === undefined
			? (() => {
					try {
						return createWebsiteBackendClient(env);
					} catch {
						return null;
					}
				})()
			: options.store;

	return {
		async consume(args: ConsumeArgs): Promise<ConsumeResult> {
			const expiresAt = Date.parse(args.expiresAtISO);
			const current = now();
			const token = args.token.trim();
			if (!Number.isFinite(expiresAt) || expiresAt <= current) {
				return { ok: false, reason: "expired" };
			}

			if (store) {
				try {
					return (await store.consumeCliLoginToken({
						token,
						expiresAtISO: args.expiresAtISO,
						nowMs: current,
					})) as ConsumeResult;
				} catch (error) {
					if (!allowMemoryFallback) {
						throw new CliLoginReplayStoreError(
							error instanceof Error ? error.message : String(error),
						);
					}
				}
			}

			if (!allowMemoryFallback) {
				throw new CliLoginReplayStoreError(
					"Bardo website login replay store is not configured and memory fallback is disabled.",
				);
			}

			return consumeWithMemory({
				usedTokens,
				token,
				expiresAt,
				current,
			});
		},
		reset(): void {
			usedTokens.clear();
		},
	};
}
