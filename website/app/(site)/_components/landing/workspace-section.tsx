import LazyFileTree from "@/components/lazy-file-tree";
import SectionLabel from "@/components/section-label";
import { bardoWorkspace } from "./data";

export default function WorkspaceSection() {
	return (
		<section className="mt-16 [contain-intrinsic-size:920px] [content-visibility:auto]">
			<div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-16">
				<div>
					<SectionLabel>Local workspace truth</SectionLabel>
					<h2 className="mb-4 text-2xl font-semibold leading-snug tracking-tight text-foreground">
						Your campaign stays local. The hosted GM layer stays remote.
					</h2>
					<p className="mb-6 text-sm leading-relaxed text-muted-foreground">
						Bardo V1 assumes one user-selected local workspace per active bridge
						session. The bridge reads and writes inside that workspace only, and
						the hosted MCP never becomes your campaign database.
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
							/ Bridge-first flow
						</p>
						<code className="font-mono text-sm text-foreground">
							bardo connect --client codex
						</code>
					</div>
				</div>

				<div>
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
