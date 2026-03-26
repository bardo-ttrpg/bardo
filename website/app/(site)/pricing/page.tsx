import { Suspense } from "react";
import StructuredData from "@/components/structured-data";
import { createPublicMetadata } from "@/lib/site-metadata";
import { resolvePricingClerkConfig } from "./pricing-clerk-config";
import PricingToggle from "./pricing-toggle";
import SubscriptionDetailsCta from "./subscription-details-button";

export const metadata = createPublicMetadata({
	title: "Pricing",
	description:
		"Simple paid remote MCP pricing for Bardo with Clerk Billing and one subscription that unlocks the full toolset.",
	path: "/pricing",
	keywords: [
		"AI game master pricing",
		"MCP credits pricing",
		"solo RPG AI pricing",
		"Bardo pricing",
	],
});

const faqs = [
	{
		q: "What counts as a credit?",
		a: "One accepted Bardo MCP tool call consumes one credit. Website usage, sign-in, billing management, and bridge approval are not metered.",
	},
	{
		q: "Can I manage my subscription anytime?",
		a: "Yes. Start, cancel, or resume from Clerk Billing. Changes follow your active billing period.",
	},
	{
		q: "Where does my campaign data live?",
		a: "Your campaign workspace stays local. Bardo V1 sells remote MCP access and guardrails, not cloud campaign storage.",
	},
] as const;

export default function PricingPage() {
	const { clerkEnabled, clerkPlanIds } = resolvePricingClerkConfig({
		publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
		secretKey: process.env.CLERK_SECRET_KEY,
	});
	const structuredData = {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: faqs.map((faq) => ({
			"@type": "Question",
			name: faq.q,
			acceptedAnswer: {
				"@type": "Answer",
				text: faq.a,
			},
		})),
	};

	return (
		<div className="mx-auto max-w-7xl px-4 sm:px-6">
			<StructuredData data={structuredData} />
			{/* ── Hero ── */}
			<section className="border-b border-border py-16 text-center">
				<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					/ Pricing
				</p>
				<h1 className="mb-4 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
					One subscription unlocks the full Bardo MCP toolset.
				</h1>
				<p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-muted-foreground">
					Subscribe once, connect through the local bridge, and use the full
					remote Bardo GM and world-simulation toolset against your local
					workspace. Clerk handles sign-up, billing, and the customer portal.
				</p>
				<SubscriptionDetailsCta clerkEnabled={clerkEnabled} />
			</section>

			{/* ── Tier cards with URL-driven monthly/yearly toggle ── */}
			<section className="py-16">
				<Suspense
					fallback={
						<div className="border border-border bg-card/20 px-6 py-8 text-center">
							<p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
								Loading pricing options…
							</p>
						</div>
					}
				>
					<PricingToggle
						clerkEnabled={clerkEnabled}
						clerkPlanIds={clerkPlanIds}
					/>
				</Suspense>
			</section>

			{/* ── FAQ ── */}
			<section className="border border-border [contain-intrinsic-size:600px] [content-visibility:auto]">
				<div className="border-b border-border px-8 py-4">
					<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						/ FAQ
					</p>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-3">
					{faqs.map(({ q, a }, i) => (
						<div
							key={q}
							className={[
								"p-8",
								i < faqs.length - 1
									? "border-b border-border sm:border-b-0 sm:border-r"
									: "",
							]
								.filter(Boolean)
								.join(" ")}
						>
							<h3 className="mb-3 text-sm font-semibold text-foreground">
								{q}
							</h3>
							<p className="text-sm leading-relaxed text-muted-foreground">
								{a}
							</p>
						</div>
					))}
				</div>
			</section>

			<div className="py-16" />
		</div>
	);
}
