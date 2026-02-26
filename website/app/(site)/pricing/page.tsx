import type { Metadata } from "next";
import CrosshairMarker from "@/components/crosshair-marker";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import PricingToggle, { type BillingPeriod } from "./pricing-toggle";
import SubscriptionDetailsCta from "./subscription-details-button";

export const metadata: Metadata = {
	title: "Pricing",
	description: "Clerk Billing plans for Free, Solo, and Solo Plus.",
};

const faqs = [
	{
		q: "What counts as a credit?",
		a: "One MCP tool call consumes one credit. Credits reset each billing cycle based on your active plan interval.",
	},
	{
		q: "Can I change plans anytime?",
		a: "Yes. Upgrade, downgrade, or cancel from Clerk Billing. Changes follow your active billing period.",
	},
	{
		q: "Is there a self-hosted option?",
		a: "The Bardo MCP server is open source, so you can self-host it. Hosted plans add managed persistence, billing, and team workflow support.",
	},
] as const;

type PricingPageProps = {
	searchParams: Promise<{ billing?: string }>;
};

export default async function PricingPage({ searchParams }: PricingPageProps) {
	const resolvedSearchParams = await searchParams;
	const billingPeriod: BillingPeriod =
		resolvedSearchParams.billing === "yearly" ? "yearly" : "monthly";
	const clerkEnabled = isClerkAuthConfigured({
		publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
		secretKey: process.env.CLERK_SECRET_KEY,
	});

	return (
		<div className="mx-auto max-w-7xl px-4 sm:px-6">
			{/* ── Hero ── */}
			<section className="border-b border-border py-16 text-center">
				<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					/ Pricing
				</p>
				<h1 className="mb-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
					Simple pricing with Clerk Billing.
				</h1>
				<p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-muted-foreground">
					Start free, then scale with Solo or Solo Plus. Yearly plans offer up
					to 27% savings versus monthly billing.
				</p>
				<SubscriptionDetailsCta clerkEnabled={clerkEnabled} />
			</section>

			{/* ── Tier cards with URL-driven monthly/yearly toggle ── */}
			<section className="py-16">
				<PricingToggle
					billingPeriod={billingPeriod}
					clerkEnabled={clerkEnabled}
				/>
			</section>

			{/* ── FAQ ── */}
			<section className="relative border border-border [contain-intrinsic-size:600px] [content-visibility:auto]">
				<CrosshairMarker className="-left-[5px] -top-[8px]" />
				<CrosshairMarker className="-right-[5px] -top-[8px]" />
				<CrosshairMarker className="-bottom-[8px] -left-[5px]" />
				<CrosshairMarker className="-right-[5px] -bottom-[8px]" />

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
