"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CheckoutPlanTier } from "@/lib/billing-catalog";
import {
	displayPriceCents,
	formatUsdCents,
	YEARLY_SAVINGS_UP_TO_PERCENT,
} from "@/lib/billing-catalog";
import { clerkPlanPeriodFromBillingInterval } from "@/lib/clerk-billing";
import CheckoutButton from "./checkout-button";
import { pricingTiers } from "./pricing-data";

export type BillingPeriod = "monthly" | "yearly";

export default function PricingToggle({
	clerkEnabled,
	clerkPlanIds,
}: {
	clerkEnabled: boolean;
	clerkPlanIds: Record<CheckoutPlanTier, string | null>;
}) {
	const searchParams = useSearchParams();
	const billingPeriod: BillingPeriod =
		searchParams.get("billing") === "yearly" ? "yearly" : "monthly";
	const yearly = billingPeriod === "yearly";
	const interval = yearly ? "year" : "month";
	const clerkPlanPeriod = clerkPlanPeriodFromBillingInterval(interval);
	const yearlySavingsLabel = `Save up to ${YEARLY_SAVINGS_UP_TO_PERCENT}%`;

	return (
		<>
			<div className="mb-12 flex items-center justify-center">
				<div className="inline-flex items-center gap-1 border border-border bg-card/40 p-1">
					<Link
						href="/pricing?billing=monthly"
						prefetch={false}
						aria-current={!yearly ? "page" : undefined}
						className={[
							"min-w-24 px-4 py-2 text-center font-mono text-[11px] uppercase tracking-widest transition-colors",
							!yearly
								? "bg-foreground text-background"
								: "text-muted-foreground hover:text-foreground",
						].join(" ")}
					>
						Monthly
					</Link>
					<Link
						href="/pricing?billing=yearly"
						prefetch={false}
						aria-current={yearly ? "page" : undefined}
						className={[
							"min-w-24 px-4 py-2 text-center font-mono text-[11px] uppercase tracking-widest transition-colors",
							yearly
								? "bg-foreground text-background"
								: "text-muted-foreground hover:text-foreground",
						].join(" ")}
					>
						Yearly
					</Link>
					<span className="ml-2 border border-green-400/35 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-green-400/80">
						{yearlySavingsLabel}
					</span>
				</div>
			</div>

			<div data-pricing-grid="true" className="border border-border">
				<div className="grid grid-cols-1">
					{pricingTiers.map((tier, i) => {
						const priceCents = tier.checkoutPlan
							? displayPriceCents(tier.checkoutPlan, interval)
							: 0;
						const clerkPlanId = tier.checkoutPlan
							? clerkPlanIds[tier.checkoutPlan]
							: null;
						const perLabel = yearly ? "/ yr" : "/ mo";
						const ctaClassName = [
							"block w-full border px-5 py-2.5 text-center font-mono text-[11px] uppercase tracking-widest transition-colors",
							tier.highlighted
								? "border-foreground text-foreground hover:bg-foreground hover:text-background"
								: "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
						].join(" ");

						return (
							<div
								key={tier.key}
								className={[
									"relative p-8",
									i < pricingTiers.length - 1 ? "border-b border-border" : "",
									tier.highlighted ? "bg-foreground/[0.03]" : "",
								]
									.filter(Boolean)
									.join(" ")}
							>
								{tier.highlighted && (
									<div className="mb-4 inline-block border border-foreground/30 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-foreground">
										One plan
									</div>
								)}

								<p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									{tier.name}
								</p>

								<div className="mb-2">
									<span className="font-mono text-3xl font-bold text-foreground">
										{formatUsdCents(priceCents)}
									</span>
									{priceCents > 0 && (
										<span className="ml-1 font-mono text-[11px] text-muted-foreground">
											{perLabel}
										</span>
									)}
								</div>

								<p className="mb-6 font-mono text-[10px] text-muted-foreground">
									{tier.credits.toLocaleString()} credits / month
								</p>

								<ul className="mb-8 space-y-2.5">
									{tier.features.map((feature) => (
										<li key={feature} className="flex items-start gap-2.5">
											<span className="mt-0.5 shrink-0 font-mono text-[11px] text-green-700 dark:text-green-400/70">
												✓
											</span>
											<span className="text-sm text-muted-foreground">
												{feature}
											</span>
										</li>
									))}
								</ul>

								{tier.checkoutPlan ? (
									<CheckoutButton
										clerkEnabled={clerkEnabled}
										clerkPlanId={clerkPlanId}
										planPeriod={clerkPlanPeriod}
										label={tier.cta}
										className={ctaClassName}
									/>
								) : (
									<Link
										href={tier.ctaHref}
										prefetch={false}
										className={ctaClassName}
									>
										{tier.cta} ↗
									</Link>
								)}
							</div>
						);
					})}
				</div>
			</div>
		</>
	);
}
