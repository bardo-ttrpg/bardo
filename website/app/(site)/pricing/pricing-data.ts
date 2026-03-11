import type { CheckoutPlanTier } from "@/lib/billing-catalog";

type PricingTier = {
	key: "free" | CheckoutPlanTier;
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
		key: "free",
		name: "Free",
		credits: 100,
		highlighted: false,
		cta: "Get started",
		ctaHref: "/sign-up",
		features: [
			"1 active campaign",
			"100 MCP calls / month",
			"Canon-backed report tools",
			"Markdown-first workspace",
			"Community support",
		],
	},
	{
		key: "solo",
		checkoutPlan: "solo",
		name: "Solo",
		credits: 25_000,
		highlighted: true,
		cta: "Start Solo",
		ctaHref: "/sign-up",
		features: [
			"Unlimited campaigns",
			"25,000 MCP calls / month",
			"Full continuity workflows",
			"Hosted account + billing",
			"World-state reports",
			"Clerk billing management",
		],
	},
	{
		key: "solo_plus",
		checkoutPlan: "solo_plus",
		name: "Solo Plus",
		credits: 50_000,
		highlighted: false,
		cta: "Go Solo Plus",
		ctaHref: "/sign-up",
		features: [
			"Unlimited campaigns",
			"50,000 MCP calls / month",
			"Full continuity workflows",
			"Hosted account + billing",
			"Priority support",
			"Earlier workflow access",
		],
	},
] as const;
