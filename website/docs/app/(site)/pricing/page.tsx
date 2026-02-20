import type { Metadata } from "next";
import CrosshairMarker from "@/components/crosshair-marker";
import PricingToggle, { type BillingPeriod } from "./pricing-toggle";

export const metadata: Metadata = {
	title: "Pricing",
	description:
		"Stripe subscriptions for Free, Solo, Solo Plus, and Party plans.",
};

const faqs = [
	{
		q: "What counts as a credit?",
		a: "One MCP tool call consumes one credit. Credits reset each billing cycle based on your Stripe subscription interval.",
	},
	{
		q: "Can I change plans anytime?",
		a: "Yes. Upgrade or downgrade anytime in the billing portal. Cancellations remain active until the current period ends.",
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

	return (
		<div className="mx-auto max-w-7xl px-4 sm:px-6">
			{/* ── Hero ── */}
			<section className="border-b border-border py-16 text-center">
				<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					/ Pricing
				</p>
				<h1 className="mb-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
					Simple pricing with Stripe subscriptions.
				</h1>
				<p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-muted-foreground">
					Start free, then scale with Solo, Solo Plus, or Party. Yearly plans
					offer up to 27% savings versus monthly billing.
				</p>
			</section>

			{/* ── Tier cards with URL-driven monthly/yearly toggle ── */}
			<section className="py-16">
				<PricingToggle billingPeriod={billingPeriod} />
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
