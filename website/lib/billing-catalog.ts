import {
	type BillingInterval,
	PARTY_MAX_SEATS,
	PARTY_MIN_SEATS,
	type PlanTier,
} from "./user-billing";

export type PaidPlanTier = Exclude<PlanTier, "free">;
export type CheckoutPlanTier = PaidPlanTier;

export const YEARLY_SAVINGS_UP_TO_PERCENT = 27;
export const PARTY_CREDITS_PER_SEAT = 20_000;

const BASE_MONTHLY_CENTS: Record<CheckoutPlanTier, number> = {
	solo: 1_499,
	solo_plus: 2_499,
	party: 1_299,
};

const BASE_YEARLY_CENTS: Record<CheckoutPlanTier, number> = {
	solo: 13_499,
	solo_plus: 22_499,
	party: 11_400,
};

const STRIPE_PRICE_ENV: Record<
	CheckoutPlanTier,
	Record<BillingInterval, string>
> = {
	solo: {
		month: "STRIPE_PRICE_SOLO_MONTHLY",
		year: "STRIPE_PRICE_SOLO_YEARLY",
	},
	solo_plus: {
		month: "STRIPE_PRICE_SOLO_PLUS_MONTHLY",
		year: "STRIPE_PRICE_SOLO_PLUS_YEARLY",
	},
	party: {
		month: "STRIPE_PRICE_PARTY_MONTHLY",
		year: "STRIPE_PRICE_PARTY_YEARLY",
	},
};

export function isCheckoutPlanTier(value: unknown): value is CheckoutPlanTier {
	return value === "solo" || value === "solo_plus" || value === "party";
}

export function isBillingInterval(value: unknown): value is BillingInterval {
	return value === "month" || value === "year";
}

export function normalizePartyCheckoutSeats(raw: unknown): number {
	const numeric = Number(raw);
	if (!Number.isFinite(numeric)) {
		return PARTY_MIN_SEATS;
	}

	const rounded = Math.floor(numeric);
	return Math.max(PARTY_MIN_SEATS, Math.min(PARTY_MAX_SEATS, rounded));
}

export function sanitizePartySeatsInput(value: string): string {
	return value.replace(/[^\d]/g, "");
}

export function normalizePartySeats(
	value: string | number | null | undefined,
): number {
	if (typeof value === "number") {
		return normalizePartyCheckoutSeats(value);
	}
	if (!value) {
		return PARTY_MIN_SEATS;
	}
	const parsed = Number.parseInt(sanitizePartySeatsInput(value), 10);
	return normalizePartyCheckoutSeats(parsed);
}

export function monthlyPriceCents(plan: CheckoutPlanTier): number {
	return BASE_MONTHLY_CENTS[plan];
}

export function yearlyPriceCents(plan: CheckoutPlanTier): number {
	return BASE_YEARLY_CENTS[plan];
}

export function displayPriceCents(
	plan: CheckoutPlanTier,
	interval: BillingInterval,
): number {
	return interval === "year" ? yearlyPriceCents(plan) : monthlyPriceCents(plan);
}

export function stripePriceEnvVar(
	plan: CheckoutPlanTier,
	interval: BillingInterval,
): string {
	return STRIPE_PRICE_ENV[plan][interval];
}

export function getStripePriceId(
	plan: CheckoutPlanTier,
	interval: BillingInterval,
	env: Record<string, string | undefined> = process.env,
): string {
	const envKey = stripePriceEnvVar(plan, interval);
	const value = env[envKey]?.trim();
	if (!value) {
		throw new Error(`Missing environment variable: ${envKey}`);
	}
	return value;
}

export function partyCreditsForSeats(value: string | number): number {
	return normalizePartySeats(value) * PARTY_CREDITS_PER_SEAT;
}

export function partySeatPriceCents(yearly: boolean): number {
	return yearly ? yearlyPriceCents("party") : monthlyPriceCents("party");
}

export function partyTotalCentsForSeats(
	value: string | number,
	yearly: boolean,
): number {
	return normalizePartySeats(value) * partySeatPriceCents(yearly);
}

export function formatUsdCents(cents: number): string {
	return (cents / 100).toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

export function resolvePlanFromStripePriceId(
	priceId: string | null | undefined,
	env: Record<string, string | undefined> = process.env,
): { plan: CheckoutPlanTier; interval: BillingInterval } | null {
	if (!priceId) return null;

	for (const plan of ["solo", "solo_plus", "party"] as const) {
		for (const interval of ["month", "year"] as const) {
			const candidate = env[stripePriceEnvVar(plan, interval)]?.trim();
			if (candidate && candidate === priceId) {
				return { plan, interval };
			}
		}
	}

	return null;
}
