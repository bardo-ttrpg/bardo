"use client";

import { listConnectionClientAdapters } from "@bardo/mcp/client-adapters";
import { type ReactNode, startTransition, useEffect, useState } from "react";
import { TransitionLink } from "@/components/transition-link";
import { BardoViewTransition } from "@/components/view-transition";
import { cn } from "@/lib/utils";
import CheckoutButton from "./_billing/checkout-button";
import SubscriptionDetailsCta from "./_billing/subscription-details-button";
import { DashboardSignOutButton } from "./signout-button";

type BillingState = {
	plan: string;
	creditsTotal: number;
	creditsUsed: number;
	creditsRemaining: number;
	periodStart: number;
	mcpCallsTotal: number;
	mcpCallsThisPeriod: number;
	subscriptionStatus: string;
	subscriptionId: string | null;
	billingInterval: "month" | "year" | null;
	currentPeriodEnd: number | null;
	cancelAtPeriodEnd: boolean;
};

type DashboardData = {
	billing: BillingState | null;
	accessPolicy: {
		subscribed: boolean;
		mcpPeriodLimit: number;
	};
};

function formatDate(value: number | null | undefined): string {
	if (!value) return "Not scheduled";
	return new Date(value).toLocaleString();
}

function isPaidPlan(plan: string | null | undefined): boolean {
	return plan === "solo";
}

const SUPPORTED_CLIENT_LABELS = listConnectionClientAdapters()
	.filter((client) => client.supportsLocal)
	.map((client) => client.label);

const dashboardCardClassName = "space-y-4 border border-border bg-card p-6";
const dashboardLabelClassName = "ui-label text-muted-foreground";
const dashboardActionClassName =
	"ui-button inline-flex border border-border px-4 py-2 text-foreground transition-colors hover:bg-subtle";
const dashboardSubtleActionClassName =
	"ui-button inline-flex border border-border px-4 py-2 text-muted-foreground transition-colors hover:bg-subtle";

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
			<p className={dashboardLabelClassName}>{label}</p>
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
	billing: BillingState | null;
	mcpPeriodLimit: number;
}) {
	return (
		<DashboardCard label="Plan & Usage">
			{billingLoading ? (
				<p className="font-reading-body text-muted-foreground">Loading...</p>
			) : billing ? (
				<div className="space-y-3">
					<p className="font-reading-body text-foreground">
						Access:{" "}
						<strong className="font-ui text-xs uppercase tracking-[0.12em]">
							{billing.plan === "solo" ? "subscribed" : billing.plan}
						</strong>
					</p>
					<p className="font-reading-body text-foreground">
						Status:{" "}
						<strong className="font-ui text-xs uppercase tracking-[0.12em]">
							{billing.subscriptionStatus}
						</strong>
					</p>
					<p className="font-reading-body text-foreground">
						MCP calls this period:{" "}
						<strong>{billing.mcpCallsThisPeriod.toLocaleString()}</strong> /{" "}
						{mcpPeriodLimit.toLocaleString()}
					</p>
					<p className="font-reading-body text-foreground">
						Credits remaining:{" "}
						<strong>{billing.creditsRemaining.toLocaleString()}</strong>
					</p>
					<p className="font-reading-body text-muted-foreground">
						MCP calls total: {billing.mcpCallsTotal.toLocaleString()}
					</p>
					<p className="font-reading-body text-muted-foreground">
						Credits total: {billing.creditsTotal.toLocaleString()}
					</p>
					<p className="font-reading-body text-muted-foreground">
						Next reset: {formatDate(billing.currentPeriodEnd)}
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

function ConnectBridgeCard({ billing }: { billing: BillingState | null }) {
	const paid = isPaidPlan(billing?.plan);

	return (
		<DashboardCard label="Connect Your Bridge">
			<p className="font-reading-body text-foreground">
				Your AI client talks to a local bridge. The browser approval flow keeps
				workspace access explicit and leaves campaign files on your machine.
			</p>
			<ol className="font-reading-body mt-4 space-y-2 text-muted-foreground">
				<li>1. Confirm billing access from this dashboard.</li>
				<li>2. Follow the client setup guide.</li>
				<li>3. Approve the bridge session in your browser.</li>
				<li>4. Return to your client and keep working locally.</li>
			</ol>
			<p className="font-reading-body mt-4 text-foreground">
				{paid
					? "This account is eligible to approve new bridge sessions."
					: "An active subscription is required before a bridge session can be approved."}
			</p>
			<div className="mt-6 flex flex-wrap gap-3">
				<TransitionLink
					href="/docs/connect-client"
					className={dashboardActionClassName}
				>
					Open Setup Guide
				</TransitionLink>
				<TransitionLink
					href="/pricing"
					className={dashboardSubtleActionClassName}
				>
					Pricing
				</TransitionLink>
			</div>
		</DashboardCard>
	);
}

function BillingActionsCard({
	billing,
	clerkEnabled,
	clerkPlanId,
}: {
	billing: BillingState | null;
	clerkEnabled: boolean;
	clerkPlanId: string | null;
}) {
	const buttonClassName = dashboardActionClassName;

	return (
		<DashboardCard label="Billing Actions">
			<p className="font-reading-body text-muted-foreground">
				Pricing stays simple on the public site. Subscription actions and
				account-specific billing controls still live here in the dashboard.
			</p>
			<div className="mt-6">
				{isPaidPlan(billing?.plan) ? (
					<SubscriptionDetailsCta clerkEnabled={clerkEnabled} />
				) : (
					<CheckoutButton
						clerkEnabled={clerkEnabled}
						clerkPlanId={clerkPlanId}
						planPeriod="month"
						label="Subscribe"
						className={buttonClassName}
					/>
				)}
			</div>
		</DashboardCard>
	);
}

export function DashboardClient({
	clerkEnabled,
	clerkPlanId,
}: {
	clerkEnabled: boolean;
	clerkPlanId: string | null;
}) {
	const [dashboardData, setDashboardData] = useState<DashboardData | null>(
		null,
	);
	const [billingLoading, setBillingLoading] = useState(true);

	useEffect(() => {
		const controller = new AbortController();

		void (async () => {
			try {
				const response = await fetch("/api/billing", {
					cache: "no-store",
					signal: controller.signal,
				});
				if (!response.ok) {
					return;
				}
				const payload = (await response.json()) as DashboardData;
				startTransition(() => {
					setDashboardData(payload);
				});
			} catch {
				// Keep the dashboard usable even when the billing request fails.
			} finally {
				startTransition(() => {
					setBillingLoading(false);
				});
			}
		})();

		return () => controller.abort();
	}, []);

	const billing = dashboardData?.billing ?? null;
	const mcpPeriodLimit = dashboardData?.accessPolicy.mcpPeriodLimit ?? 0;

	return (
		<div className="mx-auto max-w-5xl px-6 pb-16 pt-8 sm:pb-24 sm:pt-8 lg:pt-10">
			<BardoViewTransition>
				<div className="flex flex-col gap-6 border border-border bg-card p-6 lg:flex-row lg:items-end lg:justify-between">
					<div className="space-y-3">
						<p className={dashboardLabelClassName}>Account Dashboard</p>
						<h1 className="font-reading-heading text-4xl text-foreground sm:text-5xl">
							Dashboard.
						</h1>
						<p className="font-reading-body max-w-3xl text-muted-foreground">
							Use this page to verify billing state, connect a supported client,
							and approve bridge sessions without the old marketing shell around
							it.
						</p>
					</div>
					<div className="flex items-center gap-3">
						<TransitionLink
							href="/docs/connect-client"
							className={dashboardSubtleActionClassName}
						>
							Client Setup
						</TransitionLink>
						<DashboardSignOutButton />
					</div>
				</div>
			</BardoViewTransition>

			<BardoViewTransition>
				<div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
					<ConnectBridgeCard billing={billing} />
					<BillingPlanCard
						billingLoading={billingLoading}
						billing={billing}
						mcpPeriodLimit={mcpPeriodLimit}
					/>
				</div>
			</BardoViewTransition>

			<BardoViewTransition>
				<div className="mt-6 grid gap-6 lg:grid-cols-2">
					<BillingActionsCard
						billing={billing}
						clerkEnabled={clerkEnabled}
						clerkPlanId={clerkPlanId}
					/>

					<DashboardCard label="Supported Clients">
						<p className="font-reading-body text-muted-foreground">
							The bridge is designed for common MCP-capable clients. The path is
							intentionally narrow: install, connect, approve in the browser,
							then work from your local workspace.
						</p>
						<div className="mt-4 flex flex-wrap gap-2">
							{SUPPORTED_CLIENT_LABELS.map((label) => (
								<span
									key={label}
									className="technical-meta border border-border px-3 py-1 text-muted-foreground"
								>
									{label}
								</span>
							))}
						</div>
					</DashboardCard>
				</div>
			</BardoViewTransition>
		</div>
	);
}
