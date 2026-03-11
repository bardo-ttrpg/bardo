import CrosshairMarker from "@/components/crosshair-marker";
import LazyFileTree from "@/components/lazy-file-tree";
import SectionLabel from "@/components/section-label";
import { bardoWorkspace } from "./data";

export default function WorkspaceSection() {
	return (
		<section className="mt-16 [contain-intrinsic-size:920px] [content-visibility:auto]">
			<div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-16">
				<div>
					<SectionLabel>Local-first workspace</SectionLabel>
					<h2 className="mb-4 text-2xl font-semibold leading-snug tracking-tight text-foreground">
						One command. Full campaign structure.
					</h2>
					<p className="mb-6 text-sm leading-relaxed text-muted-foreground">
						Run{" "}
						<code className="border border-border px-1.5 py-0.5 font-mono text-xs text-foreground">
							bardo init
						</code>{" "}
						in any folder and Bardo creates the nested workspace scaffold:
						canonical events, projections, logs, rules, world files, and local
						docs under <code className="font-mono text-xs">bardo/docs/</code>.
					</p>
					<p className="mb-6 text-sm leading-relaxed text-muted-foreground">
						Read your campaign truth directly from markdown. The fastest path is
						usually{" "}
						<code className="font-mono text-xs">
							projections/current-state.md
						</code>
						, then{" "}
						<code className="font-mono text-xs">events/canonical.ndjson</code>,
						then the generated reports in{" "}
						<code className="font-mono text-xs">logs/</code>.
					</p>
					<div className="border border-border bg-card/40 p-4">
						<p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
							/ Init command
						</p>
						<code className="font-mono text-sm text-foreground">
							cd ./the-iron-duchy && bardo init
						</code>
					</div>
				</div>

				<div className="relative">
					<CrosshairMarker className="-left-[5px] -top-[8px]" />
					<CrosshairMarker className="-right-[5px] -top-[8px]" />
					<CrosshairMarker className="-bottom-[8px] -left-[5px]" />
					<CrosshairMarker className="-right-[5px] -bottom-[8px]" />
					<LazyFileTree
						root={bardoWorkspace}
						defaultSelectedId="current-state"
						className="h-full"
					/>
				</div>
			</div>
		</section>
	);
}
