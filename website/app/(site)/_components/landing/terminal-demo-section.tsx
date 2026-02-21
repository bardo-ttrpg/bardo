import LazyTerminal from "@/components/lazy-terminal";
import SectionLabel from "@/components/section-label";
import { terminalTools } from "./data";

export default function TerminalDemoSection() {
	return (
		<section className="mt-16 [contain-intrinsic-size:780px] [content-visibility:auto]">
			<div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-16">
				<div>
					<SectionLabel>See it in action</SectionLabel>
					<h2 className="mb-4 text-2xl font-semibold leading-snug tracking-tight text-foreground">
						A real Bardo session — every tool call visible.
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						Bardo exposes all GM operations as MCP tools. Your agent calls them
						explicitly — no hallucinated dice rolls, no forgotten NPCs, no state
						drift. What you see in the terminal is exactly what happened in the
						world.
					</p>
				</div>
				<div className="hidden md:flex md:flex-col md:justify-end">
					<ul className="space-y-2">
						{terminalTools.map(({ tool, desc }) => (
							<li key={tool} className="flex items-center gap-3">
								<code className="shrink-0 border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
									{tool}
								</code>
								<span className="text-xs text-muted-foreground">{desc}</span>
							</li>
						))}
					</ul>
				</div>
			</div>
			<LazyTerminal />
		</section>
	);
}
