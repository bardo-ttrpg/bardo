"use client";

import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

type PricingTier = {
	name: string;
	description: string;
	monthlyPrice: string;
	yearlyPrice: string;
	features: readonly string[];
	featured?: boolean;
};

export default function AssetPricingToggle({
	tiers,
}: {
	tiers: readonly PricingTier[];
}) {
	const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div className="template-chip">
					<span className="h-2 w-2 rounded-full bg-[#68cc58]" />
					Transparent Pricing
				</div>
				<div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1">
					<button
						type="button"
						onClick={() => setBilling("monthly")}
						className={clsx(
							"rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em]",
							billing === "monthly"
								? "bg-white text-[#080a09]"
								: "text-white/65 hover:text-white",
						)}
					>
						Monthly
					</button>
					<button
						type="button"
						onClick={() => setBilling("yearly")}
						className={clsx(
							"rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em]",
							billing === "yearly"
								? "bg-white text-[#080a09]"
								: "text-white/65 hover:text-white",
						)}
					>
						Yearly
					</button>
					<span className="rounded-full bg-[#f3ffc9] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#080a09]">
						30% Off
					</span>
				</div>
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				{tiers.map((tier) => {
					const price =
						billing === "monthly" ? tier.monthlyPrice : tier.yearlyPrice;

					return (
						<article
							key={tier.name}
							className={clsx(
								"template-surface rounded-[32px] p-8",
								tier.featured &&
									"border-[#f3ffc9]/30 bg-[linear-gradient(180deg,rgba(243,255,201,0.1),rgba(255,255,255,0.05))]",
							)}
						>
							<div className="flex items-start justify-between gap-4">
								<div>
									<p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/52">
										{tier.featured ? "Popular" : "Plan"}
									</p>
									<h3 className="mt-4 text-3xl font-semibold text-white">
										{tier.name}
									</h3>
									<p className="mt-3 text-sm leading-7 text-white/68">
										{tier.description}
									</p>
								</div>
								{tier.featured ? (
									<span className="template-chip border-[#f3ffc9]/30 bg-[#f3ffc9]/12 text-[#f3ffc9]">
										Best fit
									</span>
								) : null}
							</div>

							<div className="mt-10 flex items-end gap-3">
								<span className="text-2xl font-semibold text-white/80">$</span>
								<span className="text-6xl font-semibold leading-none tracking-[-0.06em] text-white">
									{price}
								</span>
								<span className="pb-1 text-sm text-white/55">
									Per user/month
								</span>
							</div>

							<ul className="mt-8 space-y-3">
								{tier.features.map((feature) => (
									<li
										key={feature}
										className="flex items-center gap-3 text-sm text-white/74"
									>
										<span className="h-2 w-2 rounded-full bg-[#f3ffc9]" />
										{feature}
									</li>
								))}
							</ul>

							<a
								href="/contact"
								className={clsx(
									"mt-10 inline-flex items-center gap-2 rounded-full px-5 py-3 font-mono text-[11px] uppercase tracking-[0.22em]",
									tier.featured
										? "bg-white text-[#080a09]"
										: "border border-white/14 text-white hover:border-white/28",
								)}
							>
								Get started now
								<ArrowRight className="h-4 w-4" />
							</a>
						</article>
					);
				})}
			</div>
		</div>
	);
}
