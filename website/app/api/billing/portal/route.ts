import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import type { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { getStripeClient } from "@/lib/stripe-server";

export const runtime = "nodejs";

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

export async function POST(req: NextRequest) {
	const { userId } = await auth();
	if (!userId) {
		return json(401, { error: "Authentication required." });
	}

	try {
		const convex = getConvexClient();
		const user = await convex.query(api.users.getUserByClerkId, {
			clerkId: userId,
		});
		const stripeCustomerId = user?.stripeCustomerId;
		if (!stripeCustomerId) {
			return json(400, {
				error: "No Stripe customer exists for this account yet.",
			});
		}

		const stripe = getStripeClient();
		const appBaseUrl =
			process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(req.url).origin;
		const portalSession = await stripe.billingPortal.sessions.create({
			customer: stripeCustomerId,
			return_url: `${appBaseUrl}/pricing`,
			configuration: process.env.STRIPE_BILLING_PORTAL_CONFIG_ID || undefined,
		});

		return json(200, { url: portalSession.url });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unable to open billing portal.";
		return json(500, { error: message });
	}
}
