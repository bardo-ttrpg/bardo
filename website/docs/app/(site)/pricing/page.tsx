import type { Metadata } from "next";
import PricingToggle from "./pricing-toggle";

export const metadata: Metadata = {
	title: "Pricing",
	description: "Simple, transparent pricing for every campaign scale.",
};

/* ── Crosshair marker ── */
function X({ className = "" }: { className?: string }) {
	return (
		<span
			aria-hidden="true"
			className={`pointer-events-none absolute select-none font-mono text-base leading-none text-foreground/20 ${className}`}
		>
			+
		</span>
	);
}

const faqs = [
	{
		q: "What counts as a credit?",
		a: "One MCP tool call — state-get, player-action, world-sync, etc. — consumes one credit. Reads are cheap; writes cost the same. Credits reset on your monthly billing date.",
	},
	{
		q: "Can I change plans anytime?",
		a: "Yes. Upgrade or downgrade at any time. Unused credits don't carry over between periods.",
	},
	{
		q: "Is there a self-hosted option?",
		a: "The Bardo MCP server is open source. You can self-host it without any account. The hosted plans add persistence, analytics, and multi-device sync.",
	},
] as const;

export default function PricingPage() {
	return (
		<div className="mx-auto max-w-7xl px-4 sm:px-6">
			{/* ── Hero ── */}
			<section className="border-b border-border py-16 text-center">
				<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					/ Pricing
				</p>
				<h1 className="mb-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
					Simple, transparent pricing.
				</h1>
				<p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-muted-foreground">
					Start free. Scale as your campaign does. No hidden fees, no feature
					gates on core tools.
				</p>
			</section>

			{/* ── Tier cards (client — has billing toggle) ── */}
			<section className="py-16">
				<PricingToggle />
			</section>

			{/* ── FAQ ── */}
			<section className="relative border border-border">
				<X className="-left-[5px] -top-[8px]" />
				<X className="-right-[5px] -top-[8px]" />
				<X className="-bottom-[8px] -left-[5px]" />
				<X className="-right-[5px] -bottom-[8px]" />

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
							<h3 className="mb-3 text-sm font-semibold text-foreground">{q}</h3>
							<p className="text-sm leading-relaxed text-muted-foreground">{a}</p>
						</div>
					))}
				</div>
			</section>

			<div className="py-16" />
		</div>
	);
}
