"use client";

import { AnimatedSpan, Terminal } from "@/components/magicui/terminal";

export default function BardoTerminal() {
	return (
		<Terminal className="min-h-[480px] max-h-[520px]">
			{/* Connect */}
			<AnimatedSpan delay={0.2} className="text-muted-foreground">
				<span>$ bardo connect --client codex</span>
			</AnimatedSpan>
			<AnimatedSpan delay={0.7} className="text-green-400/80">
				<span>✓ Browser approval complete</span>
			</AnimatedSpan>
			<AnimatedSpan delay={0.9} className="text-green-400/80">
				<span>✓ Local workspace selected — ./the-iron-duchy</span>
			</AnimatedSpan>
			<AnimatedSpan delay={1.1} className="text-green-400/80">
				<span>✓ Remote MCP bridge ready — subscription active</span>
			</AnimatedSpan>

			{/* Divider */}
			<AnimatedSpan delay={1.5} className="text-border/60">
				<span>─────────────────────────────────────</span>
			</AnimatedSpan>

			{/* Canon pull */}
			<AnimatedSpan delay={1.8} className="text-muted-foreground/60">
				<span>[TOOL] context_query · focus="ironhaven gate" · limit=4</span>
			</AnimatedSpan>
			<AnimatedSpan delay={2.1}>
				<span className="text-muted-foreground/70 pl-4">
					→ 4 canon-backed results · guard roster · bribe rumors · dusk curfew
				</span>
			</AnimatedSpan>

			{/* Player action */}
			<AnimatedSpan delay={3.0}>
				<span>
					<span className="text-foreground/50">You </span>
					<span className="text-foreground/90">
						"Zara steps forward and tries to bribe the guard."
					</span>
				</span>
			</AnimatedSpan>

			{/* Premium turn resolution */}
			<AnimatedSpan delay={3.6} className="text-muted-foreground/50">
				<span>
					[TOOL] scene_turn · requested outcome="enter the city quietly"
				</span>
			</AnimatedSpan>
			<AnimatedSpan delay={4.0} className="text-muted-foreground/70 pl-4">
				<span>
					→ Guard accepts the bribe · Zara loses 10gp · no alarm raised
				</span>
			</AnimatedSpan>

			<AnimatedSpan delay={4.5} className="text-muted-foreground/50">
				<span>[TOOL] continuity_audit · after=scene_turn</span>
			</AnimatedSpan>
			<AnimatedSpan delay={5.0} className="text-muted-foreground/70 pl-4">
				<span>
					→ No canon conflicts · report refreshed in
					bardo/logs/continuity-audit.md
				</span>
			</AnimatedSpan>

			{/* GM response */}
			<AnimatedSpan delay={5.5}>
				<span>
					<span className="text-foreground/50">GM </span>
					<span className="text-foreground/90">
						"The guard pockets the coins and waves you through."
					</span>
				</span>
			</AnimatedSpan>

			{/* Local write plan */}
			<AnimatedSpan delay={6.0} className="text-muted-foreground/50">
				<span>[BRIDGE] apply_write_plan · 3 local files</span>
			</AnimatedSpan>
			<AnimatedSpan delay={6.4} className="text-muted-foreground/70 pl-4">
				<span>→ bardo/events/canonical.ndjson appended</span>
			</AnimatedSpan>
			<AnimatedSpan delay={6.6} className="text-muted-foreground/70 pl-4">
				<span>→ bardo/projections/current-state.md refreshed</span>
			</AnimatedSpan>
			<AnimatedSpan delay={7.0} className="text-green-400/60">
				<span>✓ Workspace updated locally — Bardo logic stayed remote</span>
			</AnimatedSpan>
		</Terminal>
	);
}
