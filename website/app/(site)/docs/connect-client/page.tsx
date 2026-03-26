import { createPublicMetadata } from "@/lib/site-metadata";
import DocsShell from "../_components/docs-shell";

export const metadata = createPublicMetadata({
	title: "Connect a Client",
	description:
		"Connect Codex, Claude Code, VS Code, or another MCP-capable client to the Bardo local bridge and approve remote Bardo access.",
	path: "/docs/connect-client",
	keywords: [
		"Codex MCP client",
		"Claude Code MCP client",
		"Cursor MCP server",
		"connect AI game master client",
	],
});

export default function ConnectClientDocsPage() {
	return (
		<DocsShell
			eyebrow="Connect"
			title="Connect a Client"
			lede="Your AI client connects to the local Bardo bridge. The bridge keeps local workspace access on your machine and proxies the full remote Bardo toolset to the hosted server after browser approval."
			currentPath="/docs/connect-client"
		>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					Recommended flow
				</h2>
				<ul className="space-y-2">
					<li>
						1. Run <code className="font-mono text-xs">bardo login</code> if
						this machine has not been approved yet.
					</li>
					<li>
						2. Run{" "}
						<code className="font-mono text-xs">
							bardo connect --client codex
						</code>{" "}
						or your preferred client.
					</li>
					<li>
						3. Confirm the generated client config points at the local Bardo
						bridge.
					</li>
					<li>4. Approve the bridge session in your browser when prompted.</li>
					<li>5. Select the campaign workspace root that should stay local.</li>
					<li>
						6. Use{" "}
						<code className="font-mono text-xs">bardo doctor --json</code> if
						the client, workspace, or account state looks off.
					</li>
				</ul>
			</section>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					Manual verification checklist
				</h2>
				<ul className="space-y-2">
					<li>
						Confirm the dashboard shows an active subscription before approving.
					</li>
					<li>
						Confirm the browser approval page references the same session code
						shown in the terminal.
					</li>
					<li>
						Confirm the selected workspace root is the campaign folder you
						intend to keep local.
					</li>
					<li>
						Confirm the client can read the generated Bardo docs and report
						files after connection.
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
					<li>
						<code className="font-mono text-xs">logs/timeline-diff.md</code> or
						the <code className="font-mono text-xs">timeline_diff</code> tool
						for the fastest recent-change read
					</li>
				</ul>
			</section>
		</DocsShell>
	);
}
