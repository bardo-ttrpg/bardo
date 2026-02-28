import { createHash } from "node:crypto";
import type { PlanTier } from "./user-billing";

type CacheStateValid = {
	kind: "valid";
	value: IntrospectionVerifiedKeySnapshot;
};

type CacheStateInvalid = {
	kind: "invalid";
};

export type IntrospectionVerifyCacheState = CacheStateValid | CacheStateInvalid;

export type IntrospectionVerifiedKeySnapshot = {
	subjectId: string | null;
	keyId: string;
	plan: PlanTier;
	scopes: string[];
	workspacePath: string | null;
};

type CacheRecord = {
	state: IntrospectionVerifyCacheState;
	expiresAt: number;
};

type IntrospectionVerifyCacheOptions = {
	nowMs?: () => number;
	validTtlMs?: number;
	invalidTtlMs?: number;
};

function normalizePositiveInteger(value: number | undefined, fallback: number) {
	if (!Number.isFinite(value)) {
		return fallback;
	}
	const normalized = Math.floor(value ?? fallback);
	return normalized > 0 ? normalized : fallback;
}

function cacheKey(secret: string): string {
	return createHash("sha256").update(secret).digest("base64url");
}

export function createIntrospectionVerifyCache(
	options: IntrospectionVerifyCacheOptions = {},
) {
	const now = options.nowMs ?? (() => Date.now());
	const validTtlMs = normalizePositiveInteger(options.validTtlMs, 60_000);
	const invalidTtlMs = normalizePositiveInteger(options.invalidTtlMs, 15_000);
	const cache = new Map<string, CacheRecord>();

	return {
		get(secret: string): IntrospectionVerifyCacheState | null {
			const lookupKey = cacheKey(secret.trim());
			const current = now();
			const cached = cache.get(lookupKey);
			if (!cached) return null;
			if (cached.expiresAt <= current) {
				cache.delete(lookupKey);
				return null;
			}
			return cached.state;
		},
		setValid(secret: string, value: IntrospectionVerifiedKeySnapshot): void {
			cache.set(cacheKey(secret.trim()), {
				state: {
					kind: "valid",
					value: {
						subjectId: value.subjectId,
						keyId: value.keyId,
						plan: value.plan,
						scopes: [...value.scopes],
						workspacePath: value.workspacePath,
					},
				},
				expiresAt: now() + validTtlMs,
			});
		},
		setInvalid(secret: string): void {
			cache.set(cacheKey(secret.trim()), {
				state: { kind: "invalid" },
				expiresAt: now() + invalidTtlMs,
			});
		},
		reset(): void {
			cache.clear();
		},
	};
}
