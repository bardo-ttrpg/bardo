"use client";

import { listConnectionClientAdapters } from "@bardo/mcp/client-adapters";
import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
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
		<div className="border border-border p-6">
			<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				Plan & Usage
			</p>
			{billingLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : billing ? (
				<div className="space-y-3">
					<p className="text-sm">
						Access:{" "}
						<strong className="uppercase">
							{billing.plan === "solo" ? "subscribed" : billing.plan}
						</strong>
					</p>
					<p className="text-sm">
						Status:{" "}
						<strong className="uppercase">{billing.subscriptionStatus}</strong>
					</p>
					<p className="text-sm">
						MCP calls this period:{" "}
						<strong>{billing.mcpCallsThisPeriod.toLocaleString()}</strong> /{" "}
						{mcpPeriodLimit.toLocaleString()}
					</p>
					<p className="text-sm">
						Credits remaining:{" "}
						<strong>{billing.creditsRemaining.toLocaleString()}</strong>
					</p>
					<p className="text-sm text-muted-foreground">
						MCP calls total: {billing.mcpCallsTotal.toLocaleString()}
					</p>
					<p className="text-sm text-muted-foreground">
						Credits total: {billing.creditsTotal.toLocaleString()}
					</p>
					<p className="text-sm text-muted-foreground">
						Next reset: {formatDate(billing.currentPeriodEnd)}
					</p>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">
					No subscription found yet.
				</p>
			)}
		</div>
	);
}

function ConnectBridgeCard({ billing }: { billing: BillingState | null }) {
	const paid = isPaidPlan(billing?.plan);

	return (
		<div className="border border-border p-6">
			<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				Connect Your Bridge
			</p>
			<p className="text-sm text-foreground">
				Bardo V1 keeps your campaign workspace local. Your AI client talks to a
				thin local bridge, and the bridge proxies Bardo MCP tools to the hosted
				server after browser approval.
			</p>
			<ol className="mt-4 space-y-2 text-sm text-muted-foreground">
				<li>1. Subscribe with Clerk Billing.</li>
				<li>2. Follow the client setup guide.</li>
				<li>3. Approve the bridge session in your browser.</li>
				<li>4. Use Bardo tools against your local workspace.</li>
			</ol>
			<p className="mt-4 text-sm">
				{paid
					? "This account is eligible to approve new bridge sessions."
					: "An active subscription is required before a bridge session can be approved."}
			</p>
			<div className="mt-6 flex flex-wrap gap-3">
				<Link
					href="/docs/connect-client"
					className="border border-foreground px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
				>
					Open Setup Guide
				</Link>
				<Link
					href="/pricing"
					className="border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
				>
					Manage Plan
				</Link>
			</div>
		</div>
	);
}

export function DashboardClient() {
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
		<div className="mx-auto max-w-6xl px-6 py-16">
			<div className="flex flex-col gap-6 border border-border p-6 lg:flex-row lg:items-end lg:justify-between">
				<div className="space-y-3">
					<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						Account Dashboard
					</p>
					<h1 className="text-3xl font-semibold tracking-tight text-foreground">
						Remote MCP access for your local campaign workspace
					</h1>
					<p className="max-w-3xl text-sm text-muted-foreground">
						Use this account to subscribe, connect a supported AI client, and
						approve bridge sessions. Bardo keeps campaign files local and runs
						the AI GM and world-simulation layer remotely.
					</p>
				</div>
				<div className="flex items-center gap-3">
					<Link
						href="/docs/connect-client"
						className="border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
					>
						Client Setup
					</Link>
					<DashboardSignOutButton />
				</div>
			</div>

			<div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
				<ConnectBridgeCard billing={billing} />
				<BillingPlanCard
					billingLoading={billingLoading}
					billing={billing}
					mcpPeriodLimit={mcpPeriodLimit}
				/>
			</div>

			<div className="mt-6 grid gap-6 lg:grid-cols-2">
				<div className="border border-border p-6">
					<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						Supported Clients
					</p>
					<p className="text-sm text-muted-foreground">
						The V1 bridge is designed for common MCP-capable clients. The happy
						path is the same across them: install the local bridge, select your
						workspace, approve in the browser, then use Bardo tools.
					</p>
					<div className="mt-4 flex flex-wrap gap-2">
						{SUPPORTED_CLIENT_LABELS.map((label) => (
							<span
								key={label}
								className="border border-border px-3 py-1 text-xs text-muted-foreground"
							>
								{label}
							</span>
						))}
					</div>
				</div>

				<div className="border border-border p-6">
					<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						V1 Boundary
					</p>
					<div className="space-y-2 text-sm text-muted-foreground">
						<p>Website: signup, billing, docs, and bridge approval.</p>
						<p>Local bridge: workspace root selection and local file I/O.</p>
						<p>
							Remote MCP: subscription checks, guardrails, tool execution, and
							metering.
						</p>
						<p>
							AI client: connects only to the local bridge in the canonical
							flow.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
