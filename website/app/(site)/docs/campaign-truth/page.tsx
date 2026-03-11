import type { Metadata } from "next";
import DocsShell from "../_components/docs-shell";

export const metadata: Metadata = {
	title: "How Bardo Stores Campaign Truth",
	description:
		"Understand the canonical event log, current-state projection, and generated reports.",
};

export default function CampaignTruthDocsPage() {
	return (
		<DocsShell
			eyebrow="Campaign Truth"
			title="How Bardo Stores Campaign Truth"
			lede="Bardo does not hide your campaign inside a black box. Canon stays in local files you can read, edit, diff, and version-control."
		>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					Primary files
				</h2>
				<ul className="space-y-2">
					<li>
						<code className="font-mono text-xs">events/canonical.ndjson</code>{" "}
						is the append-only canon log.
					</li>
					<li>
						<code className="font-mono text-xs">
							projections/current-state.md
						</code>{" "}
						is the main canon-derived state snapshot.
					</li>
					<li>
						<code className="font-mono text-xs">state/current.md</code> mirrors
						the state for compatibility.
					</li>
					<li>
						<code className="font-mono text-xs">logs/*.md</code> contains
						readable continuity reports.
					</li>
				</ul>
			</section>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					Trust model
				</h2>
				<ul className="space-y-2">
					<li>
						<strong className="text-foreground">Canon</strong> is backed by
						canonical events or explicit saved state.
					</li>
					<li>
						<strong className="text-foreground">Inference</strong> is derived
						from canon and remains reviewable.
					</li>
					<li>
						<strong className="text-foreground">Suggestion</strong> is optional
						and does not become canon automatically.
					</li>
				</ul>
			</section>
		</DocsShell>
	);
}
