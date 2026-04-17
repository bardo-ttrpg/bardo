"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BardoViewTransition } from "@/components/view-transition";
import type {
	BillingViewState,
	DashboardViewData,
} from "@/lib/billing-view-data";
import { cn } from "@/lib/utils";
import CheckoutButton from "./_billing/checkout-button";
import SubscriptionDetailsCta from "./_billing/subscription-details-button";
import { DashboardSignOutButton } from "./signout-button";

function formatDate(value: number | null | undefined): string {
	if (!value) return "Not scheduled";
	return new Date(value).toLocaleString();
}

function isPaidPlan(plan: string | null | undefined): boolean {
	return plan === "solo";
}

const dashboardCardClassName = "space-y-4";
const dashboardLabelClassName = "ui-label text-muted-foreground";
const dashboardActionClassName =
	"ui-button inline-flex px-4 py-2 text-foreground transition-colors hover:bg-subtle";

function DashboardCard({
	label,
	children,
	className,
}: {
	label: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className={cn(dashboardCardClassName, className)}>
			<p className="font-medium">{label}</p>
			{children}
		</section>
	);
}

export function BillingPlanCard({
	billingLoading,
	billing,
	mcpPeriodLimit,
}: {
	billingLoading: boolean;
	billing: BillingViewState | null;
	mcpPeriodLimit: number;
}) {
	return (
		<DashboardCard label="Plan & Usage:" className="pt-8">
			{billingLoading ? (
				<p className="font-reading-body text-muted-foreground">Loading...</p>
			) : billing ? (
				<div className="space-y-3">
					<p className="font-reading-body text-foreground">
						Subscription:{" "}
						<strong className="font-ui text-xs uppercase tracking-[0.12em]">
							{billing.plan === "solo" ? "subscribed" : billing.plan}
						</strong>
					</p>
					<p className="font-reading-body text-foreground">
						Reset: <strong>{formatDate(billing.currentPeriodEnd)}</strong>
					</p>
					<p className="font-reading-body text-foreground">
						Status:{" "}
						<strong className="font-ui text-xs uppercase tracking-[0.12em]">
							{billing.subscriptionStatus}
						</strong>
					</p>
					<p className="font-reading-body text-foreground">
						MCP Total Calls:{" "}
						<strong>{billing.mcpCallsTotal.toLocaleString()}</strong>
					</p>
					<p className="font-reading-body text-muted-foreground">
						MCP Period Limit: {mcpPeriodLimit.toLocaleString()}
					</p>
				</div>
			) : (
				<p className="font-reading-body text-muted-foreground">
					No subscription found yet.
				</p>
			)}
		</DashboardCard>
	);
}

function BillingActionsCard({
	billing,
	clerkEnabled,
	clerkPlanId,
}: {
	billing: BillingViewState | null;
	clerkEnabled: boolean;
	clerkPlanId: string | null;
}) {
	return (
		<div className="mt-6">
			{isPaidPlan(billing?.plan) ? (
				<SubscriptionDetailsCta clerkEnabled={clerkEnabled} />
			) : (
				<CheckoutButton
					clerkEnabled={clerkEnabled}
					clerkPlanId={clerkPlanId}
					planPeriod="month"
					label="Subscribe"
					className={dashboardActionClassName}
				/>
			)}
		</div>
	);
}

export function DashboardClient({
	clerkEnabled,
	clerkPlanId,
	initialDashboardData,
}: {
	clerkEnabled: boolean;
	clerkPlanId: string | null;
	initialDashboardData: DashboardViewData | null;
}) {
	const billing = initialDashboardData?.billing ?? null;
	const mcpPeriodLimit = initialDashboardData?.accessPolicy.mcpPeriodLimit ?? 0;
	const billingLoading = false;

	return (
		<div className="flex w-screen justify-center pt-8 md:pt-10">
			<BardoViewTransition name="bardo-page-region">
				<div className="w-screen max-w-5xl px-6 sm:px-8">
					<p className={dashboardLabelClassName}>Account</p>
					<h1 className="font-reading-heading py-4 text-4xl text-foreground sm:text-5xl">
						Dashboard
					</h1>
					<p className="font-reading-body text-muted-foreground">
						Verify and manage everything related to you account from this page.
					</p>
					<p className="font-reading-body text-muted-foreground">
						Learn how to setup and connect everything at the{" "}
						<Link href="/docs" className="cursor-pointer underline">
							Bardo MCP documentation page
						</Link>
						.
					</p>
					<BillingPlanCard
						billingLoading={billingLoading}
						billing={billing}
						mcpPeriodLimit={mcpPeriodLimit}
					/>
				</div>

				<BillingActionsCard
					billing={billing}
					clerkEnabled={clerkEnabled}
					clerkPlanId={clerkPlanId}
				/>
				<DashboardSignOutButton />
			</BardoViewTransition>
		</div>
	);
}
