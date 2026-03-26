import type { PlanTier } from "./user-billing";

/**
 * Maximum number of active API keys allowed per plan tier.
 * Key creation/validation is handled by Clerk's API key system.
 * Revocation, storage, and secret generation are all Clerk-managed.
 */
export function maxApiKeysForPlan(plan: PlanTier): number {
	switch (plan) {
		case "free":
			return 1;
		case "solo":
			return 5;
	}
}

const DEFAULT_MCP_PERIOD_LIMIT: Record<PlanTier, number> = {
	free: 100,
	solo: 25_000,
};

const DEFAULT_DAILY_USER_VERIFICATION_LIMIT: Record<PlanTier, number> = {
	free: 500,
	solo: 7_500,
};

const DEFAULT_DAILY_KEY_VERIFICATION_LIMIT: Record<PlanTier, number> = {
	free: 500,
	solo: 2_000,
};

function readPositiveLimit(
	value: string | undefined,
	fallback: number,
): number {
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 1) {
		return fallback;
	}
	return Math.floor(parsed);
}

/**
 * Daily cap for API key introspection verifications per user/account.
 * Protects Clerk verification spend and blocks abusive key usage patterns.
 */
export function dailyUserVerificationLimitForPlan(
	plan: PlanTier,
	env: Record<string, string | undefined> = process.env,
): number {
	switch (plan) {
		case "free":
			return readPositiveLimit(
				env.BARDO_DAILY_USER_VERIFICATIONS_FREE,
				DEFAULT_DAILY_USER_VERIFICATION_LIMIT.free,
			);
		case "solo":
			return readPositiveLimit(
				env.BARDO_DAILY_USER_VERIFICATIONS_SOLO,
				DEFAULT_DAILY_USER_VERIFICATION_LIMIT.solo,
			);
	}
}

/**
 * Daily cap for API key introspection verifications per key.
 */
export function dailyKeyVerificationLimitForPlan(
	plan: PlanTier,
	env: Record<string, string | undefined> = process.env,
): number {
	switch (plan) {
		case "free":
			return readPositiveLimit(
				env.BARDO_DAILY_KEY_VERIFICATIONS_FREE,
				DEFAULT_DAILY_KEY_VERIFICATION_LIMIT.free,
			);
		case "solo":
			return readPositiveLimit(
				env.BARDO_DAILY_KEY_VERIFICATIONS_SOLO,
				DEFAULT_DAILY_KEY_VERIFICATION_LIMIT.solo,
			);
	}
}

/**
 * Billing-period MCP usage cap per user plan.
 * This is enforced by the MCP runtime after successful API key introspection.
 */
export function mcpPeriodLimitForPlan(
	plan: PlanTier,
	env: Record<string, string | undefined> = process.env,
): number {
	switch (plan) {
		case "free":
			return readPositiveLimit(
				env.BARDO_MCP_PERIOD_LIMIT_FREE,
				DEFAULT_MCP_PERIOD_LIMIT.free,
			);
		case "solo":
			return readPositiveLimit(
				env.BARDO_MCP_PERIOD_LIMIT_SOLO,
				DEFAULT_MCP_PERIOD_LIMIT.solo,
			);
	}
}
