import { auth, currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import type { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import {
	getStripePriceId,
	isBillingInterval,
	isCheckoutPlanTier,
	normalizePartyCheckoutSeats,
} from "@/lib/billing-catalog";
import { getStripeClient } from "@/lib/stripe-server";

export const runtime = "nodejs";

type CheckoutRequestPayload = {
	plan?: unknown;
	interval?: unknown;
	quantity?: unknown;
};

function json(status: number, payload: Record<string, unknown>): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function getConvexClient(): ConvexHttpClient {
	const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
	if (!convexUrl) {
		throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured.");
	}
	return new ConvexHttpClient(convexUrl);
}

async function ensureBillingUser(
	convex: ConvexHttpClient,
	clerkId: string,
): Promise<
	Awaited<ReturnType<typeof convex.query<typeof api.users.getUserByClerkId>>>
> {
	const existing = await convex.query(api.users.getUserByClerkId, { clerkId });
	if (existing) return existing;

	const clerkUser = await currentUser();
	await convex.mutation(api.users.upsertUser, {
		clerkId,
		email: clerkUser?.primaryEmailAddress?.emailAddress ?? null,
		imageUrl: clerkUser?.imageUrl ?? null,
		name:
			[clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
			clerkUser?.username ||
			null,
	});

	return convex.query(api.users.getUserByClerkId, { clerkId });
}

export async function POST(req: NextRequest) {
	const { userId } = await auth();
	if (!userId) {
		return json(401, { error: "Authentication required." });
	}

	let payload: CheckoutRequestPayload;
	try {
		payload = (await req.json()) as CheckoutRequestPayload;
	} catch {
		return json(400, { error: "Invalid JSON request body." });
	}

	if (!isCheckoutPlanTier(payload.plan)) {
		return json(400, { error: "Invalid plan." });
	}

	if (!isBillingInterval(payload.interval)) {
		return json(400, { error: "Invalid billing interval." });
	}

	const plan = payload.plan;
	const interval = payload.interval;
	const quantity =
		plan === "party" ? normalizePartyCheckoutSeats(payload.quantity) : 1;

	try {
		const stripe = getStripeClient();
		const convex = getConvexClient();

		const billingUser = await ensureBillingUser(convex, userId);
		if (!billingUser) {
			return json(500, {
				error: "Unable to load billing profile for current user.",
			});
		}

		let stripeCustomerId = billingUser.stripeCustomerId ?? null;
		if (!stripeCustomerId) {
			const customer = await stripe.customers.create({
				email: billingUser.email ?? undefined,
				name: billingUser.name ?? undefined,
				metadata: { clerkId: userId },
			});
			stripeCustomerId = customer.id;
			await convex.mutation(api.users.setStripeCustomerId, {
				clerkId: userId,
				stripeCustomerId,
			});
		}

		const priceId = getStripePriceId(plan, interval);
		const appBaseUrl =
			process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(req.url).origin;
		const session = await stripe.checkout.sessions.create({
			mode: "subscription",
			customer: stripeCustomerId,
			client_reference_id: userId,
			line_items: [{ price: priceId, quantity }],
			success_url: `${appBaseUrl}/pricing?checkout=success`,
			cancel_url: `${appBaseUrl}/pricing?checkout=cancel`,
			allow_promotion_codes: true,
			metadata: {
				clerkId: userId,
				plan,
				interval,
				partySeats: String(quantity),
			},
			subscription_data: {
				metadata: {
					clerkId: userId,
					plan,
					interval,
					partySeats: String(quantity),
				},
			},
		});

		if (!session.url) {
			return json(500, { error: "Stripe did not return a checkout URL." });
		}

		return json(200, { url: session.url });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unable to start checkout.";
		return json(500, { error: message });
	}
}
