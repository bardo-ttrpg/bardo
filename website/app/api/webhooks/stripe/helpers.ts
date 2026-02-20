import { ConvexHttpClient } from "convex/browser";
import type Stripe from "stripe";

export const END_OF_TERM_DOWNGRADE_STATUSES = new Set([
	"canceled",
	"unpaid",
	"incomplete_expired",
]);

export function toUnixMs(
	unixSeconds: number | null | undefined,
): number | null {
	if (!unixSeconds) return null;
	return Math.floor(unixSeconds * 1000);
}

export function asString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function hasStripeObjectTag(
	value: Stripe.Event.Data.Object,
	tag: string,
): boolean {
	if (typeof value !== "object" || value === null) return false;
	if (!("object" in value)) return false;
	return (value as { object?: unknown }).object === tag;
}

export function isCheckoutSessionObject(
	value: Stripe.Event.Data.Object,
): value is Stripe.Checkout.Session {
	return hasStripeObjectTag(value, "checkout.session");
}

export function isSubscriptionObject(
	value: Stripe.Event.Data.Object,
): value is Stripe.Subscription {
	return hasStripeObjectTag(value, "subscription");
}

export function isInvoiceObject(
	value: Stripe.Event.Data.Object,
): value is Stripe.Invoice {
	return hasStripeObjectTag(value, "invoice");
}

export function json(
	status: number,
	payload: Record<string, unknown>,
): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export function getConvexClient(): ConvexHttpClient {
	const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
	if (!convexUrl) {
		throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured.");
	}
	return new ConvexHttpClient(convexUrl);
}
