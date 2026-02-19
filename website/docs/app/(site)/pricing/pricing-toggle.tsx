"use client";

import { useState } from "react";
import Link from "next/link";

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

const tiers = [
	{
		name: "Free",
		monthly: 0,
		yearly: 0,
		credits: 100,
		highlighted: false,
		cta: "Get started",
		ctaHref: "/sign-up",
		features: [
			"1 active campaign",
			"100 MCP calls / month",
			"All core MCP tools",
			"Markdown-first storage",
			"Community support",
		],
	},
	{
		name: "Pro",
		monthly: 12,
		yearly: 99,
		credits: 1000,
		highlighted: true,
		cta: "Start Pro",
		ctaHref: "/sign-up",
		features: [
			"Unlimited campaigns",
			"1 000 MCP calls / month",
			"All core MCP tools",
			"Markdown-first storage",
			"Priority support",
			"Early access to new tools",
		],
	},
	{
		name: "Ultra",
		monthly: 39,
		yearly: 349,
		credits: 10000,
		highlighted: false,
		cta: "Go Ultra",
		ctaHref: "/sign-up",
		features: [
			"Unlimited campaigns",
			"10 000 MCP calls / month",
			"All core MCP tools",
			"Markdown-first storage",
			"Team access",
			"SLA support",
			"API access",
		],
	},
] as const;

export default function PricingToggle() {
	const [yearly, setYearly] = useState(false);

	return (
		<>
			{/* Toggle */}
			<div className="mb-12 flex items-center justify-center gap-3">
				<button
					type="button"
					onClick={() => setYearly(false)}
					className={`font-mono text-[11px] uppercase tracking-widest transition-colors ${
						!yearly
							? "text-foreground"
							: "text-muted-foreground hover:text-foreground"
					}`}
				>
					Monthly
				</button>
				<button
					type="button"
					onClick={() => setYearly((v) => !v)}
					aria-label="Toggle billing period"
					className={`relative h-5 w-9 border border-border transition-colors ${
						yearly ? "bg-foreground/10" : ""
					}`}
				>
					<span
						className={`absolute top-0.5 h-4 w-4 border border-border bg-foreground transition-transform ${
							yearly ? "translate-x-4" : "translate-x-0"
						}`}
					/>
				</button>
				<button
					type="button"
					onClick={() => setYearly(true)}
					className={`flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest transition-colors ${
						yearly
							? "text-foreground"
							: "text-muted-foreground hover:text-foreground"
					}`}
				>
					Yearly
					<span className="border border-green-400/40 px-1.5 py-0.5 font-mono text-[9px] text-green-400/80">
						Save 30%
					</span>
				</button>
			</div>

			{/* Cards */}
			<div className="relative grid grid-cols-1 gap-0 sm:grid-cols-3">
				{tiers.map((tier, i) => {
					const price = yearly ? tier.yearly : tier.monthly;
					const perLabel = yearly ? "/ yr" : "/ mo";

					return (
						<div
							key={tier.name}
							className={[
								"relative border border-border p-8",
								i < tiers.length - 1 ? "sm:border-r-0" : "",
								tier.highlighted ? "bg-foreground/[0.03]" : "",
							]
								.filter(Boolean)
								.join(" ")}
						>
							<X className="-left-[5px] -top-[8px]" />
							<X className="-right-[5px] -top-[8px]" />
							<X className="-bottom-[8px] -left-[5px]" />
							<X className="-right-[5px] -bottom-[8px]" />

							{tier.highlighted && (
								<div className="mb-4 inline-block border border-foreground/30 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-foreground">
									Most popular
								</div>
							)}

							<p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								{tier.name}
							</p>

							<div className="mb-2">
								<span className="font-mono text-3xl font-bold text-foreground">
									${price}
								</span>
								{price > 0 && (
									<span className="ml-1 font-mono text-[11px] text-muted-foreground">
										{perLabel}
									</span>
								)}
							</div>

							<p className="mb-6 font-mono text-[10px] text-muted-foreground">
								{tier.credits.toLocaleString()} credits / month
							</p>

							<ul className="mb-8 space-y-2.5">
								{tier.features.map((f) => (
									<li key={f} className="flex items-start gap-2.5">
										<span className="mt-0.5 shrink-0 font-mono text-[11px] text-green-400/70">
											✓
										</span>
										<span className="text-sm text-muted-foreground">{f}</span>
									</li>
								))}
							</ul>

							<Link
								href={tier.ctaHref}
								className={[
									"block border px-5 py-2.5 text-center font-mono text-[11px] uppercase tracking-widest transition-colors",
									tier.highlighted
										? "border-foreground text-foreground hover:bg-foreground hover:text-background"
										: "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
								].join(" ")}
							>
								{tier.cta} ↗
							</Link>
						</div>
					);
				})}
			</div>
		</>
	);
}
