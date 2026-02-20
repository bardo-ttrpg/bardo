import type { ConvexHttpClient } from "convex/browser";
import type Stripe from "stripe";
import { api } from "@/convex/_generated/api";
import {
	isBillingInterval,
	isCheckoutPlanTier,
	normalizePartyCheckoutSeats,
	resolvePlanFromStripePriceId,
} from "@/lib/billing-catalog";
import { getStripeClient } from "@/lib/stripe-server";
import {
	asString,
	END_OF_TERM_DOWNGRADE_STATUSES,
	isCheckoutSessionObject,
	isInvoiceObject,
	isSubscriptionObject,
	toUnixMs,
} from "./helpers";

async function syncSubscription(
	convex: ConvexHttpClient,
	subscription: Stripe.Subscription,
): Promise<void> {
	const stripeCustomerId = asString(subscription.customer) ?? null;
	if (!stripeCustomerId) return;

	const firstItem = subscription.items.data[0];
	const priceId = firstItem?.price?.id ?? null;
	const mappedFromPrice = resolvePlanFromStripePriceId(priceId);
	const metadataPlan = asString(subscription.metadata.plan);
	const metadataInterval = asString(subscription.metadata.interval);
	const metadataSeats = Number(subscription.metadata.partySeats);
	const fallbackSeats = Number(firstItem?.quantity ?? metadataSeats);
	const planFromMetadata = isCheckoutPlanTier(metadataPlan)
		? metadataPlan
		: null;
	const plan = mappedFromPrice?.plan ?? planFromMetadata ?? undefined;
	const intervalFromPrice = firstItem?.price?.recurring?.interval;
	const billingInterval = isBillingInterval(intervalFromPrice)
		? intervalFromPrice
		: (mappedFromPrice?.interval ??
			(isBillingInterval(metadataInterval) ? metadataInterval : null));
	const partySeats =
		plan === "party" ? normalizePartyCheckoutSeats(fallbackSeats) : 1;
	const currentPeriodEnd = toUnixMs(firstItem?.current_period_end);
	const periodStart = toUnixMs(firstItem?.current_period_start);
	const status = subscription.status;
	const now = Date.now();
	const shouldDowngradeAtPeriodEnd =
		END_OF_TERM_DOWNGRADE_STATUSES.has(status) &&
		currentPeriodEnd !== null &&
		currentPeriodEnd <= now;

	if (shouldDowngradeAtPeriodEnd) {
		await convex.mutation(api.users.downgradeToFree, {
			stripeCustomerId,
			now,
		});
		return;
	}

	await convex.mutation(api.users.applyStripeSubscription, {
		clerkId: asString(subscription.metadata.clerkId) ?? undefined,
		stripeCustomerId,
		stripeSubscriptionId: subscription.id,
		stripePriceId: priceId,
		subscriptionStatus: status,
		billingInterval,
		plan,
		partySeats,
		currentPeriodEnd,
		cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
		periodStart,
		now,
	});
}

async function handleCheckoutCompleted(
	convex: ConvexHttpClient,
	event: Stripe.Event,
): Promise<void> {
	const eventObject = event.data.object;
	if (!isCheckoutSessionObject(eventObject)) {
		throw new Error(
			"checkout.session.completed payload was not a checkout session.",
		);
	}
	const session = eventObject;
	const customerId = asString(session.customer);
	const clerkId = asString(session.client_reference_id);

	if (customerId && clerkId) {
		await convex.mutation(api.users.setStripeCustomerId, {
			clerkId,
			stripeCustomerId: customerId,
		});
	}

	const subscriptionId = asString(session.subscription);
	if (!subscriptionId) return;

	const stripe = getStripeClient();
	const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
		expand: ["items.data.price"],
	});
	await syncSubscription(convex, subscription);
}

function resolveInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
	const line = invoice.lines.data[0];
	return (
		(typeof invoice.parent?.subscription_details?.subscription === "string"
			? invoice.parent.subscription_details.subscription
			: invoice.parent?.subscription_details?.subscription?.id) ??
		(typeof line?.subscription === "string"
			? line.subscription
			: line?.subscription?.id) ??
		null
	);
}

async function handleInvoicePaid(
	convex: ConvexHttpClient,
	event: Stripe.Event,
): Promise<void> {
	const eventObject = event.data.object;
	if (!isInvoiceObject(eventObject)) {
		throw new Error("invoice.paid payload was not an invoice.");
	}
	const invoice = eventObject;
	const stripeCustomerId = asString(invoice.customer);
	if (!stripeCustomerId) return;

	const user = await convex.query(api.users.getUserByStripeCustomerId, {
		stripeCustomerId,
	});
	if (!user) return;

	const line = invoice.lines.data[0];
	const linePriceId = line?.pricing?.price_details?.price ?? null;
	const mappedFromPrice = resolvePlanFromStripePriceId(linePriceId);
	const billingInterval = mappedFromPrice?.interval ?? null;
	const invoiceId = asString(invoice.id);
	if (!invoiceId) return;
	const paidAt =
		toUnixMs(invoice.status_transitions?.paid_at) ??
		toUnixMs(event.created) ??
		Date.now();
	const partySeats = normalizePartyCheckoutSeats(line?.quantity);

	await convex.mutation(api.users.recordInvoicePayment, {
		clerkId: user.clerkId,
		stripeCustomerId,
		stripeSubscriptionId: resolveInvoiceSubscriptionId(invoice),
		stripeInvoiceId: invoiceId,
		amountPaidCents: invoice.amount_paid,
		currency: invoice.currency,
		paidAt,
		status: invoice.status ?? "paid",
		billingReason: invoice.billing_reason ?? null,
		priceId: linePriceId,
		billingInterval,
		partySeats: user.plan === "party" ? partySeats : 1,
		now: Date.now(),
	});
}

async function handleInvoicePaymentFailed(
	convex: ConvexHttpClient,
	event: Stripe.Event,
): Promise<void> {
	const eventObject = event.data.object;
	if (!isInvoiceObject(eventObject)) {
		throw new Error("invoice.payment_failed payload was not an invoice.");
	}
	const invoice = eventObject;
	const subscriptionId = resolveInvoiceSubscriptionId(invoice);
	if (!subscriptionId) return;

	const stripe = getStripeClient();
	const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
		expand: ["items.data.price"],
	});
	await syncSubscription(convex, subscription);
}

export async function processStripeBillingEvent(
	convex: ConvexHttpClient,
	event: Stripe.Event,
): Promise<"processed" | "ignored"> {
	switch (event.type) {
		case "checkout.session.completed":
			await handleCheckoutCompleted(convex, event);
			return "processed";
		case "customer.subscription.created":
		case "customer.subscription.updated":
		case "customer.subscription.deleted": {
			if (!isSubscriptionObject(event.data.object)) {
				throw new Error(`${event.type} payload was not a subscription.`);
			}
			await syncSubscription(convex, event.data.object);
			return "processed";
		}
		case "invoice.paid":
			await handleInvoicePaid(convex, event);
			return "processed";
		case "invoice.payment_failed":
			await handleInvoicePaymentFailed(convex, event);
			return "processed";
		default:
			return "ignored";
	}
}
