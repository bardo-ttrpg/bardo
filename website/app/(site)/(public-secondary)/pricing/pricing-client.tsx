"use client";

import { useAuth } from "@clerk/nextjs";
import NumberFlow, { continuous, NumberFlowGroup } from "@number-flow/react";
import { CheckIcon, XIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import OptionalClerkProvider from "@/components/optional-clerk-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import CheckoutButton from "../../dashboard/_billing/checkout-button";
import SubscriptionDetailsAction from "../../dashboard/_billing/subscription-details-action";
import {
	type PricingBillingState,
	shouldShowManageSubscription,
} from "./pricing-helpers";

type PricingClientProps = {
	clerkEnabled: boolean;
	clerkPlanId: string | null;
	initialBilling: PricingBillingState | null;
};

const pricingToggleClassName =
	"ui-button rounded-full px-4 py-2 text-sm transition-colors";
const pricingPrimaryActionClassName =
	"ui-button inline-flex w-full md:w-80 items-center justify-center rounded-full bg-primary px-5 py-2.5 text-primary-foreground transition-colors hover:bg-primary/90";

const pricingPros = [
	"Understands your world before it acts.",
	"Checks canon before adding anything new.",
	"Runs scenes from your real campaign files.",
	"Keeps track of world state and changes.",
	"Uses your rulebook instead of guessing.",
	"Gives your AI the right tools for TTRPG play.",
] as const;

const pricingCons = [
	"Guesses instead of knowing your world.",
	"Breaks canon with made-up details.",
	"Forgets important details and consequences.",
	"Drifts into generic fantasy.",
	"Needs repeated reminders.",
	"Breaks immersion when continuity slips.",
] as const;

export function PricingClient({
	clerkEnabled,
	clerkPlanId,
	initialBilling,
}: PricingClientProps) {
	return (
		<OptionalClerkProvider enabled={clerkEnabled}>
			<PricingClientContent
				clerkEnabled={clerkEnabled}
				clerkPlanId={clerkPlanId}
				initialBilling={initialBilling}
			/>
		</OptionalClerkProvider>
	);
}

function PricingSwapText({
	value,
	className,
	as = "span",
}: {
	value: string;
	className?: string;
	as?: "span" | "p";
}) {
	const Comp = as;

	return (
		<Comp className={cn("relative inline-grid", className)}>
			<span key={value} className="col-start-1 row-start-1 pricing-copy-swap">
				{value}
			</span>
		</Comp>
	);
}

function PricingCtaLabel({
	children,
	labelKey,
}: {
	children: ReactNode;
	labelKey: string;
}) {
	return (
		<span className="relative inline-grid overflow-hidden">
			<span
				key={labelKey}
				className="col-start-1 row-start-1 pricing-copy-swap"
			>
				{children}
			</span>
		</span>
	);
}

function AnimatedPricingValue({
	amount,
	billingPeriod,
}: {
	amount: number;
	billingPeriod: "month" | "year";
}) {
	return (
		<NumberFlowGroup>
			<NumberFlow
				value={amount}
				locales="en-US"
				format={{
					style: "currency",
					currency: "USD",
					maximumFractionDigits: 0,
					trailingZeroDisplay: "stripIfInteger",
				}}
				suffix={billingPeriod === "month" ? "/month" : "/yearly"}
				plugins={[continuous]}
				willChange
				transformTiming={{
					duration: 700,
					easing: "cubic-bezier(0.22, 1, 0.36, 1)",
				}}
				spinTiming={{
					duration: 900,
					easing: "cubic-bezier(0.18, 0.9, 0.24, 1)",
				}}
				opacityTiming={{
					duration: 280,
					easing: "ease-out",
				}}
				className="pricing-number-flow font-reading-heading text-5xl text-foreground"
			/>
		</NumberFlowGroup>
	);
}

function PricingClientContent({
	clerkEnabled,
	clerkPlanId,
	initialBilling,
}: PricingClientProps) {
	const { isLoaded, isSignedIn } = useAuth();
	const [billingPeriod, setBillingPeriod] = useState<"month" | "year">("month");
	const billing = isLoaded && isSignedIn ? initialBilling : null;
	const monthlyPrice = 20;
	const yearlyMonthlyEquivalent = 16;
	const displayedPrice =
		billingPeriod === "month" ? monthlyPrice : yearlyMonthlyEquivalent;
	const pricingDescription =
		billingPeriod === "year"
			? "Pay annually and save more on the same plan."
			: "Pay monthly now and switch to annual later.";
	const shouldManageCurrentPlan = shouldShowManageSubscription({
		billing,
		billingPeriod,
	});

	return (
		<section
			className="bardo-page-region flex flex-col gap-10"
			aria-labelledby="pricing-plan-heading"
		>
			<header className="flex justify-center">
				<nav
					aria-label="Billing period"
					className="inline-flex rounded-full border border-border bg-muted/40 p-1"
				>
					<Button
						type="button"
						onClick={() => setBillingPeriod("month")}
						aria-pressed={billingPeriod === "month"}
						variant="ghost"
						className={cn(
							pricingToggleClassName,
							billingPeriod === "month"
								? "bg-foreground text-background"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						Monthly
					</Button>
					<Button
						type="button"
						onClick={() => setBillingPeriod("year")}
						aria-pressed={billingPeriod === "year"}
						variant="ghost"
						className={cn(
							pricingToggleClassName,
							billingPeriod === "year"
								? "bg-foreground text-background"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						Yearly
					</Button>
				</nav>
			</header>

			<section className="grid gap-8">
				<article className="w-full rounded-[2rem] border border-border bg-card p-6 shadow-sm sm:p-8">
					<div className="flex flex-col">
						<header className="flex flex-col gap-2">
							<p className="ui-label">Bardo Solo</p>
							<h1 id="pricing-plan-heading" className="sr-only">
								Bardo Solo pricing
							</h1>
							<AnimatedPricingValue
								amount={displayedPrice}
								billingPeriod={billingPeriod}
							/>
							<br />
							<PricingSwapText
								as="p"
								value={pricingDescription}
								className="font-reading-body text-muted-foreground"
							/>
						</header>

						<div className="flex flex-col gap-3">
							{shouldManageCurrentPlan ? (
								<SubscriptionDetailsAction
									className={pricingPrimaryActionClassName}
									label={
										<PricingCtaLabel labelKey={`manage-${billingPeriod}`}>
											Manage Subscription
										</PricingCtaLabel>
									}
								/>
							) : !isLoaded && isSignedIn ? (
								<Button
									type="button"
									variant="default"
									className={pricingPrimaryActionClassName}
									disabled
								>
									Loading billing...
								</Button>
							) : (
								<CheckoutButton
									clerkEnabled={clerkEnabled}
									clerkPlanId={clerkPlanId}
									planPeriod={billingPeriod === "month" ? "month" : "annual"}
									label={
										<PricingCtaLabel
											labelKey={
												billingPeriod === "month"
													? "subscribe-monthly"
													: "subscribe-yearly"
											}
										>
											{billingPeriod === "month"
												? "Subscribe Monthly"
												: "Subscribe Yearly"}
										</PricingCtaLabel>
									}
									className={pricingPrimaryActionClassName}
								/>
							)}

							<section className="grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
								<section className="flex flex-col gap-4">
									<h2 className="font-reading-heading text-2xl text-foreground">
										Using Bardo MCP
									</h2>
									<ul className="flex flex-col gap-3">
										{pricingPros.map((item) => (
											<li
												key={item}
												className="flex items-center gap-3 font-reading-body text-foreground"
											>
												<span className="mt-0.5 text-emerald-600">
													<CheckIcon className="size-4" aria-hidden="true" />
												</span>
												<span>{item}</span>
											</li>
										))}
									</ul>
								</section>
								<section className="flex flex-col gap-4">
									<h2 className="font-reading-heading text-2xl text-foreground">
										No Bardo MCP
									</h2>
									<ul className="flex flex-col gap-3">
										{pricingCons.map((item) => (
											<li
												key={item}
												className="flex items-center gap-3 font-reading-body text-foreground"
											>
												<span className="mt-0.5 text-red-600">
													<XIcon className="size-4" aria-hidden="true" />
												</span>
												<span>{item}</span>
											</li>
										))}
									</ul>
								</section>
							</section>
						</div>
					</div>
				</article>
			</section>
		</section>
	);
}
