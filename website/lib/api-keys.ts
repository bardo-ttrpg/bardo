import type { PlanTier } from "./user-billing";

/**
 * Maximum number of active API keys allowed per plan tier.
 * Key creation/validation is handled by Clerk's API key system.
 * Revocation, storage, and secret generation are all Clerk-managed.
 */
export function maxApiKeysForPlan(plan: PlanTier): number {
	switch (plan) {
		case "free":
			return 0;
		case "pro":
			return 5;
	}
}

const DEFAULT_MCP_PERIOD_LIMIT: Record<PlanTier, number> = {
	free: 0,
	pro: 25_000,
};

const DEFAULT_DAILY_USER_VERIFICATION_LIMIT: Record<PlanTier, number> = {
	free: 0,
	pro: 7_500,
};

const DEFAULT_DAILY_KEY_VERIFICATION_LIMIT: Record<PlanTier, number> = {
	free: 0,
	pro: 2_000,
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
			return DEFAULT_DAILY_USER_VERIFICATION_LIMIT.free;
		case "pro":
			return readPositiveLimit(
				env.BARDO_DAILY_USER_VERIFICATIONS_PRO,
				DEFAULT_DAILY_USER_VERIFICATION_LIMIT.pro,
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
			return DEFAULT_DAILY_KEY_VERIFICATION_LIMIT.free;
		case "pro":
			return readPositiveLimit(
				env.BARDO_DAILY_KEY_VERIFICATIONS_PRO,
				DEFAULT_DAILY_KEY_VERIFICATION_LIMIT.pro,
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
			return DEFAULT_MCP_PERIOD_LIMIT.free;
		case "pro":
			return readPositiveLimit(
				env.BARDO_MCP_PERIOD_LIMIT_PRO,
				DEFAULT_MCP_PERIOD_LIMIT.pro,
			);
	}
}
