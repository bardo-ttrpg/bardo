import { resolvePlanFromClerkPlanId } from "./clerk-billing";
import type {
	BillingInterval,
	PlanTier,
	SubscriptionStatus,
} from "./user-billing";

type BillingSubscriptionItemLike = {
	status?: string | null;
	planPeriod?: "month" | "annual" | null;
	planId?: string | null;
	periodStart?: number | null;
	periodEnd?: number | null;
	canceledAt?: number | null;
};

type BillingSubscriptionLike = {
	id?: string | null;
	status?: string | null;
	subscriptionItems?: BillingSubscriptionItemLike[] | null;
};

type ClerkBillingLike = {
	billing?: {
		getUserBillingSubscription?: (userId: string) => Promise<unknown>;
	};
};

const PRIORITY_ITEM_STATUSES = new Set([
	"active",
	"trialing",
	"past_due",
	"incomplete",
]);

function asSubscriptionStatus(
	value: string | null | undefined,
): SubscriptionStatus {
	switch (value) {
		case "incomplete":
		case "incomplete_expired":
		case "trialing":
		case "active":
		case "past_due":
		case "canceled":
		case "unpaid":
		case "paused":
			return value;
		default:
			return "canceled";
	}
}

function selectSubscriptionItem(
	items: BillingSubscriptionItemLike[] | null | undefined,
): BillingSubscriptionItemLike | null {
	if (!items || items.length === 0) return null;

	const prioritized = items.find((item) =>
		PRIORITY_ITEM_STATUSES.has(item.status ?? ""),
	);
	return prioritized ?? items[0] ?? null;
}

function resolvePlanFromItem(
	item: BillingSubscriptionItemLike | null,
	env: Record<string, string | undefined>,
): PlanTier {
	const planId = item?.planId;
	if (!planId) return "free";
	const resolved = resolvePlanFromClerkPlanId(planId, env);
	return resolved === "solo" ? "solo" : "free";
}

function resolveIntervalFromItem(
	item: BillingSubscriptionItemLike | null,
): BillingInterval | null {
	if (!item) return null;
	return item.planPeriod === "annual" ? "year" : "month";
}

export function resolveLiveBillingSnapshotFromSubscription(
	subscription: BillingSubscriptionLike | null,
	env: Record<string, string | undefined> = process.env,
	now = Date.now(),
) {
	const item = selectSubscriptionItem(subscription?.subscriptionItems);
	const plan = resolvePlanFromItem(item, env);
	const periodStart =
		typeof item?.periodStart === "number" ? item.periodStart : now;
	const currentPeriodEnd =
		typeof item?.periodEnd === "number" ? item.periodEnd : null;
	const cancelAtPeriodEnd =
		typeof item?.canceledAt === "number" &&
		typeof item?.periodEnd === "number" &&
		item.periodEnd > now;

	return {
		plan,
		periodStart,
		currentPeriodEnd,
		billingInterval: resolveIntervalFromItem(item),
		subscriptionStatus: asSubscriptionStatus(subscription?.status),
		subscriptionId: subscription?.id ?? null,
		cancelAtPeriodEnd,
	};
}

export function createClerkBillingReader(clerk: ClerkBillingLike) {
	const billing = clerk.billing;
	if (!billing || typeof billing.getUserBillingSubscription !== "function") {
		return null;
	}

	return async (userId: string) =>
		(await billing.getUserBillingSubscription?.(
			userId,
		)) as BillingSubscriptionLike;
}

export async function fetchLiveBillingSnapshotFromClerk(
	clerk: ClerkBillingLike,
	userId: string,
	env: Record<string, string | undefined> = process.env,
	now = Date.now(),
) {
	let subscription: BillingSubscriptionLike | null = null;
	let billingUnavailable = false;
	const readSubscription = createClerkBillingReader(clerk);

	try {
		if (!readSubscription) {
			throw new Error("Clerk billing is unavailable.");
		}
		subscription = await readSubscription(userId);
	} catch {
		// Treat a Clerk billing failure as an unknown billing state so callers can
		// return 503 instead of silently downgrading subscribed users.
		billingUnavailable = true;
		subscription = null;
	}
	return {
		...resolveLiveBillingSnapshotFromSubscription(subscription, env, now),
		billingUnavailable,
	};
}
