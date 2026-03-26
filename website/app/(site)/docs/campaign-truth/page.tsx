import { createPublicMetadata } from "@/lib/site-metadata";
import DocsShell from "../_components/docs-shell";

export const metadata = createPublicMetadata({
	title: "How Bardo Stores Campaign Truth",
	description:
		"Understand Bardo's canonical event log, current-state projection, readable continuity reports, and canon vs inference model.",
	path: "/docs/campaign-truth",
	keywords: [
		"campaign continuity",
		"canonical markdown files",
		"TTRPG world state",
		"AI GM memory",
	],
});

export default function CampaignTruthDocsPage() {
	return (
		<DocsShell
			eyebrow="Campaign Truth"
			title="How Bardo Stores Campaign Truth"
			lede="Bardo does not hide your campaign inside a black box. Canon stays in local files you can read, edit, diff, and version-control."
			currentPath="/docs/campaign-truth"
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
					<li>
						<code className="font-mono text-xs">logs/timeline-diff.md</code> and{" "}
						the <code className="font-mono text-xs">timeline_diff</code> tool
						cover the recent-change workflow.
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
