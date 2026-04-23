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
	plan?: {
		id?: string | null;
		slug?: string | null;
		name?: string | null;
		isDefault?: boolean | null;
	} | null;
	periodStart?: Date | number | string | null;
	periodEnd?: Date | number | string | null;
	canceledAt?: Date | number | string | null;
	isFreeTrial?: boolean | null;
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

type LiveBillingSnapshot = {
	billingInterval: BillingInterval | null;
	cancelAtPeriodEnd: boolean;
	currentPeriodEnd: number | null;
	periodStart: number;
	plan: PlanTier;
	subscriptionId: string | null;
	subscriptionStatus: SubscriptionStatus;
};

const PRIORITY_ITEM_STATUSES = new Set([
	"active",
	"trialing",
	"past_due",
	"incomplete",
	"ended",
]);

const PAID_ACCESS_ITEM_STATUSES = new Set(["active", "trialing"]);

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
		case "ended":
			return "canceled";
		case "upcoming":
			return "incomplete";
		default:
			return "canceled";
	}
}

function toEpochMs(value: Date | number | string | null | undefined) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (value instanceof Date) return value.getTime();
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
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
	const planIds = [item?.planId, item?.plan?.id].filter(
		(value): value is string => Boolean(value?.trim()),
	);
	for (const planId of planIds) {
		const resolved = resolvePlanFromClerkPlanId(planId, env);
		if (resolved === "pro") return "pro";
	}

	const planSlug = item?.plan?.slug?.trim().toLowerCase();
	if (planSlug === "pro") return "pro";

	const planName = item?.plan?.name?.trim().toLowerCase();
	if (!item?.plan?.isDefault && planName === "pro") return "pro";

	return "free";
}

function resolveIntervalFromItem(
	item: BillingSubscriptionItemLike | null,
): BillingInterval | null {
	if (!item) return null;
	return item.planPeriod === "annual" ? "year" : "month";
}

function selectProSubscriptionItem(
	items: BillingSubscriptionItemLike[] | null | undefined,
	env: Record<string, string | undefined>,
): BillingSubscriptionItemLike | null {
	if (!items || items.length === 0) return null;

	const proItems = items.filter(
		(item) => resolvePlanFromItem(item, env) === "pro",
	);
	if (proItems.length === 0) return null;

	const activePro = proItems.find((item) =>
		PAID_ACCESS_ITEM_STATUSES.has(item.status ?? ""),
	);
	if (activePro) return activePro;

	const prioritizedPro = proItems.find((item) =>
		PRIORITY_ITEM_STATUSES.has(item.status ?? ""),
	);
	return prioritizedPro ?? proItems[0] ?? null;
}

function hasPaidAccess(item: BillingSubscriptionItemLike | null): boolean {
	return PAID_ACCESS_ITEM_STATUSES.has(item?.status ?? "");
}

export function resolveLiveBillingSnapshotFromSubscription(
	subscription: BillingSubscriptionLike | null,
	env: Record<string, string | undefined> = process.env,
	now = Date.now(),
): LiveBillingSnapshot {
	const proItem = selectProSubscriptionItem(
		subscription?.subscriptionItems,
		env,
	);
	const fallbackItem = selectSubscriptionItem(subscription?.subscriptionItems);
	const item = proItem ?? fallbackItem;
	const proAccess = hasPaidAccess(proItem);
	const plan: PlanTier = proAccess ? "pro" : "free";
	const subscriptionStatus: SubscriptionStatus = proAccess
		? proItem?.isFreeTrial
			? "trialing"
			: asSubscriptionStatus(proItem?.status ?? subscription?.status)
		: proItem
			? asSubscriptionStatus(proItem.status)
			: "canceled";
	const periodStart = toEpochMs(item?.periodStart) ?? now;
	const currentPeriodEnd = toEpochMs(item?.periodEnd);
	const canceledAt = toEpochMs(item?.canceledAt);
	const cancelAtPeriodEnd =
		plan === "pro" &&
		typeof canceledAt === "number" &&
		typeof currentPeriodEnd === "number" &&
		currentPeriodEnd > now;

	return {
		plan,
		periodStart,
		currentPeriodEnd,
		billingInterval: plan === "pro" ? resolveIntervalFromItem(item) : null,
		subscriptionStatus,
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
