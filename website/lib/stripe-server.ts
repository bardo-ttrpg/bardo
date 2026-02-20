import Stripe from "stripe";

let stripeClient: Stripe | null = null;

function readStripeSecretKey(
	env: Record<string, string | undefined> = process.env,
): string {
	const secretKey = env.STRIPE_SECRET_KEY?.trim();
	if (!secretKey) {
		throw new Error("Missing STRIPE_SECRET_KEY.");
	}
	return secretKey;
}

export function getStripeClient(): Stripe {
	if (stripeClient) {
		return stripeClient;
	}

	stripeClient = new Stripe(readStripeSecretKey());
	return stripeClient;
}

export function getStripeWebhookSecret(
	env: Record<string, string | undefined> = process.env,
): string {
	const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
	if (!secret) {
		throw new Error("Missing STRIPE_WEBHOOK_SECRET.");
	}
	return secret;
}
