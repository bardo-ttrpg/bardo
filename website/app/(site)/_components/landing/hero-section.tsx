import Link from "next/link";
import ScrambleText from "@/components/scramble-text";
import TextTicker from "@/components/text-ticker";
import { tickerItems } from "./data";
import InstallCommandCard from "./install-command-card";

export default function HeroSection({
	wordmarkClassName,
}: {
	wordmarkClassName: string;
}) {
	return (
		<>
			<section className="mx-auto max-w-7xl px-4 sm:px-6">
				<div className="overflow-hidden border-b border-border pb-6 pt-10">
					<p
						className={`bg-linear-to-b from-foreground to-foreground/70 bg-clip-text font-bold leading-none tracking-tight text-transparent ${wordmarkClassName}`}
						style={{ fontSize: "clamp(68px, 17.5vw, 220px)" }}
					>
						BARDO
					</p>
				</div>

				<div className="grid grid-cols-1 border-b border-border md:grid-cols-2">
					<div className="border-b border-border py-10 md:border-b-0 md:border-r md:pr-10">
						<p className="mb-6 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
							/
							<ScrambleText
								text=" System-Agnostic AI GM for TTRPG Continuity"
								from="center"
							/>
						</p>
						<h1 className="max-w-md text-balance text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl">
							A paid remote MCP for serious tabletop campaign continuity.
						</h1>
					</div>

					<div className="py-10 md:pl-10">
						<p className="mb-8 max-w-md text-sm leading-relaxed text-muted-foreground">
							Bardo gives MCP-capable AI clients a guarded AI GM and
							world-simulation layer for local TTRPG workspaces. Your campaign
							files stay on your machine, while the hosted server handles auth,
							billing, guardrails, and full tool execution.
						</p>
						<InstallCommandCard />
						<div className="flex flex-wrap gap-3">
							<Link
								href="/docs/install"
								className="border border-foreground px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
							>
								Read Docs ↗
							</Link>
							<Link
								href="/pricing"
								prefetch={false}
								className="border border-border px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
							>
								View Pricing ↗
							</Link>
						</div>
					</div>
				</div>
			</section>

			<section className="border-b border-border">
				<div className="mx-auto max-w-7xl px-4 sm:px-6">
					<div className="grid grid-cols-2 sm:grid-cols-4">
						<div className="border-b border-r border-border px-6 py-8 sm:border-b-0 sm:px-8">
							<p className="mb-1 font-mono text-3xl font-bold text-foreground tabular-nums">
								6
							</p>
							<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Premium V1 tools
							</p>
						</div>
						<div className="border-b border-border px-6 py-8 sm:border-b-0 sm:border-r sm:px-8">
							<p className="mb-1 font-mono text-3xl font-bold text-foreground tabular-nums">
								0
							</p>
							<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Cloud campaign copies
							</p>
						</div>
						<div className="border-r border-border px-6 py-8 sm:px-8">
							<p className="mb-1 font-mono text-3xl font-bold text-foreground">
								∞
							</p>
							<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								TTRPG systems
							</p>
						</div>
						<div className="px-6 py-8 sm:px-8">
							<p className="mb-1 font-mono text-3xl font-bold text-foreground tabular-nums">
								1
							</p>
							<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Bridge-first flow
							</p>
						</div>
					</div>
				</div>
			</section>

			<div className="border-b border-border py-3.5">
				<TextTicker
					items={[...tickerItems]}
					baseSpeed={0.55}
					hoverMultiplier={4}
				/>
			</div>
		</>
	);
}
