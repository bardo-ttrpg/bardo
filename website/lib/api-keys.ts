import type { PlanTier } from "./user-billing";

/**
 * Maximum number of active API keys allowed per plan tier.
 * Key creation/validation is handled by Clerk's API key system.
 * Revocation, storage, and secret generation are all Clerk-managed.
 */
export function maxApiKeysForPlan(plan: PlanTier): number {
	switch (plan) {
		case "free":
			return 10;
		case "solo":
			return 50;
		case "solo_plus":
			return 100;
		case "party":
			return 250;
	}
}
