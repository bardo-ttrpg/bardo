import type { Metadata } from "next";
import DocsShell from "../_components/docs-shell";

export const metadata: Metadata = {
	title: "Connect a Client",
	description:
		"Connect an MCP-capable client to Bardo and read the right files first.",
};

export default function ConnectClientDocsPage() {
	return (
		<DocsShell
			eyebrow="Connect"
			title="Connect a Client"
			lede="Bardo works with MCP-capable clients like Codex, Claude Code, Cursor, and others. The important part is keeping the client pointed at the same local workspace."
		>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					Recommended flow
				</h2>
				<ul className="space-y-2">
					<li>
						1. Run{" "}
						<code className="font-mono text-xs">
							bardo connect --client codex
						</code>{" "}
						or your preferred client.
					</li>
					<li>
						2. Confirm the generated client config points at the local Bardo
						server.
					</li>
					<li>
						3. Use{" "}
						<code className="font-mono text-xs">bardo doctor --json</code> if
						the client or account state looks off.
					</li>
				</ul>
			</section>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					What the agent should read first
				</h2>
				<ul className="space-y-2">
					<li>
						<code className="font-mono text-xs">
							projections/current-state.md
						</code>{" "}
						for the current canon-backed snapshot
					</li>
					<li>
						<code className="font-mono text-xs">
							logs/world-state-overview.md
						</code>{" "}
						for the readable continuity summary
					</li>
					<li>
						<code className="font-mono text-xs">logs/continuity-audit.md</code>{" "}
						when the campaign feels contradictory or stale
					</li>
				</ul>
			</section>
		</DocsShell>
	);
}
