"use client";

import { AnimatedSpan, Terminal, TypingAnimation } from "@/components/magicui/terminal";

export default function BardoTerminal() {
	return (
		<Terminal className="min-h-[480px] max-h-[520px]">
			{/* Init */}
			<AnimatedSpan delay={0.2} className="text-muted-foreground">
				<span>$ bardo init --workspace ./the-iron-duchy</span>
			</AnimatedSpan>
			<AnimatedSpan delay={0.7} className="text-green-400/80">
				<span>✓ Bardo MCP v1.0 connected</span>
			</AnimatedSpan>
			<AnimatedSpan delay={0.9} className="text-green-400/80">
				<span>✓ World state loaded — world.md · 4.1 kb</span>
			</AnimatedSpan>
			<AnimatedSpan delay={1.1} className="text-green-400/80">
				<span>✓ 4 characters · 18 NPCs · 3 active quests</span>
			</AnimatedSpan>

			{/* Divider */}
			<AnimatedSpan delay={1.5} className="text-border/60">
				<span>─────────────────────────────────────</span>
			</AnimatedSpan>

			{/* GM sets the scene */}
			<AnimatedSpan delay={1.8} className="text-muted-foreground/60">
				<span>[SESSION START]</span>
			</AnimatedSpan>
			<AnimatedSpan delay={2.1}>
				<span>
					<span className="text-foreground/50">GM  </span>
					<span className="text-foreground/90">
						"You arrive at the gates of Ironhaven at dusk.
					</span>
				</span>
			</AnimatedSpan>
			<AnimatedSpan delay={2.3}>
				<span className="text-foreground/90 pl-8">
					The guard eyes your group with suspicion."
				</span>
			</AnimatedSpan>

			{/* Player action */}
			<AnimatedSpan delay={3.0}>
				<span>
					<span className="text-foreground/50">You  </span>
					<span className="text-foreground/90">
						"Zara steps forward and tries to bribe the guard."
					</span>
				</span>
			</AnimatedSpan>

			{/* Tool calls */}
			<AnimatedSpan delay={3.6} className="text-muted-foreground/50">
				<span>[TOOL] state-get · character="Zara"</span>
			</AnimatedSpan>
			<AnimatedSpan delay={4.0} className="text-muted-foreground/70 pl-4">
				<span>→ Rogue 5 · CHA +3 · Gold: 45gp · Persuasion +7</span>
			</AnimatedSpan>

			<AnimatedSpan delay={4.5} className="text-muted-foreground/50">
				<span>[TOOL] player-action · type="persuasion" · DC=15</span>
			</AnimatedSpan>
			<AnimatedSpan delay={5.0} className="text-muted-foreground/70 pl-4">
				<span>→ d20(12) + 7 = 19 · </span>
				<span className="text-green-400/70">SUCCESS</span>
			</AnimatedSpan>

			{/* GM response */}
			<AnimatedSpan delay={5.5}>
				<span>
					<span className="text-foreground/50">GM  </span>
					<span className="text-foreground/90">
						"The guard pockets the coins and waves you through."
					</span>
				</span>
			</AnimatedSpan>

			{/* State update */}
			<AnimatedSpan delay={6.0} className="text-muted-foreground/50">
				<span>[TOOL] world-sync · updating state...</span>
			</AnimatedSpan>
			<AnimatedSpan delay={6.4} className="text-muted-foreground/70 pl-4">
				<span>→ ironhaven.gates = "bypassed"</span>
			</AnimatedSpan>
			<AnimatedSpan delay={6.6} className="text-muted-foreground/70 pl-4">
				<span>→ zara.gold -= 10 · saved to state.md</span>
			</AnimatedSpan>
			<AnimatedSpan delay={7.0} className="text-green-400/60">
				<span>✓ State persisted — session resumable anytime</span>
			</AnimatedSpan>
		</Terminal>
	);
}
