import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { api } from "@/convex/_generated/api";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe-server";
import { getConvexClient, json, toUnixMs } from "./helpers";
import { processStripeBillingEvent } from "./processor";

export const runtime = "nodejs";

async function parseWebhookEvent(req: NextRequest): Promise<Stripe.Event> {
	const stripe = getStripeClient();
	const payload = await req.text();
	const signature = req.headers.get("stripe-signature");
	if (!signature) {
		throw new Error("Missing stripe-signature header.");
	}
	return stripe.webhooks.constructEvent(
		payload,
		signature,
		getStripeWebhookSecret(),
	);
}

export async function POST(req: NextRequest) {
	const receivedAt = Date.now();
	let event: Stripe.Event;

	try {
		event = await parseWebhookEvent(req);
	} catch (error) {
		return json(400, {
			error:
				error instanceof Error ? error.message : "Invalid webhook signature.",
		});
	}

	const convex = getConvexClient();
	const reservation = await convex.mutation(api.users.reserveBillingEvent, {
		stripeEventId: event.id,
		type: event.type,
		createdAt: toUnixMs(event.created) ?? receivedAt,
		receivedAt,
	});
	if (!reservation.accepted) {
		return new Response("Duplicate event", { status: 200 });
	}

	try {
		const outcome = await processStripeBillingEvent(convex, event);
		await convex.mutation(api.users.completeBillingEvent, {
			stripeEventId: event.id,
			status: outcome,
			processedAt: Date.now(),
		});
		return new Response(outcome === "ignored" ? "Ignored" : "OK", {
			status: 200,
		});
	} catch (error) {
		await convex.mutation(api.users.completeBillingEvent, {
			stripeEventId: event.id,
			status: "failed",
			error: error instanceof Error ? error.message : "Unhandled webhook error",
			processedAt: Date.now(),
		});
		return json(500, {
			error:
				error instanceof Error
					? error.message
					: "Stripe webhook handling failed.",
		});
	}
}
