import type { CheckoutPlanTier } from "@/lib/billing-catalog";

type PricingTier = {
	key: CheckoutPlanTier;
	name: string;
	credits: number;
	highlighted: boolean;
	cta: string;
	ctaHref: string;
	features: readonly string[];
	checkoutPlan?: CheckoutPlanTier;
};

export const pricingTiers: readonly PricingTier[] = [
	{
		key: "solo",
		checkoutPlan: "solo",
		name: "Bardo",
		credits: 25_000,
		highlighted: true,
		cta: "Subscribe",
		ctaHref: "/sign-up",
		features: [
			"Paid remote MCP access",
			"Connect any supported MCP client",
			"All Bardo GM and world-simulation tools included",
			"Your campaign workspace stays local",
			"25,000 MCP calls / month",
			"Browser-approved local bridge flow",
			"Clerk billing and customer portal",
		],
	},
] as const;
