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
			"Core MCP tools",
			"Markdown-first storage",
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
			"Core MCP tools",
			"Hosted persistence",
			"Faster sync",
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
			"Core MCP tools",
			"Hosted persistence",
			"Priority support",
			"Early tool access",
		],
	},
	{
		key: "party",
		checkoutPlan: "party",
		name: "Party",
		credits: 40_000,
		highlighted: false,
		cta: "Start Party",
		ctaHref: "/sign-up",
		features: [
			"Per-seat billing",
			"20,000 MCP calls / seat / month",
			"Core MCP tools",
			"Team access",
			"Priority support",
			"SLA support",
			"Shared workspace tooling",
		],
	},
] as const;
