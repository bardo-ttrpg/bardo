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
						A real Bardo session with canon and continuity in the open.
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						Bardo keeps tool calls explicit and the resulting world state
						readable. What your agent does can be traced back to canonical
						events, refreshed projections, and markdown reports inside the
						workspace.
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
