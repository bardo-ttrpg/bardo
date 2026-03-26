import { createPublicMetadata } from "@/lib/site-metadata";
import InstallCommandCard from "../../_components/landing/install-command-card";
import DocsShell from "../_components/docs-shell";

export const metadata = createPublicMetadata({
	title: "Install",
	description:
		"Install the local Bardo bridge, connect your MCP-capable client, and approve remote Bardo access for your local campaign workspace.",
	path: "/docs/install",
	keywords: [
		"install Bardo",
		"AI game master CLI",
		"Codex MCP install",
		"Claude Code MCP install",
	],
});

export default function InstallDocsPage() {
	return (
		<DocsShell
			eyebrow="Install"
			title="Install Bardo"
			lede="Install the local bridge, sign in on the website, subscribe, connect your client, approve a bridge session in the browser, and point the bridge at your campaign workspace."
			currentPath="/docs/install"
		>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					1. Install the local bridge
				</h2>
				<InstallCommandCard />
			</section>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					2. Sign in and subscribe
				</h2>
				<p>
					Create your account on the website, start the subscription in Clerk
					Billing, and confirm the dashboard shows an active subscription before
					you try to connect a client.
				</p>
			</section>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					3. Connect your first client
				</h2>
				<div className="border border-border bg-muted/20 p-4 font-mono text-xs text-foreground">
					<p>bardo login</p>
					<p>bardo connect --client codex</p>
					<p># approve the bridge session in your browser</p>
					<p># point the bridge at your campaign workspace</p>
					<p>bardo doctor --json</p>
				</div>
			</section>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					4. Keep the workspace local
				</h2>
				<p>
					Bardo V1 does not store your campaign in the cloud. The local bridge
					reads and writes only inside your chosen campaign workspace, while the
					remote MCP handles subscription checks, tool execution, guardrails,
					and metering.
				</p>
			</section>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					5. Verify the first protected tool call
				</h2>
				<p>
					After your client is connected, ask it to read
					<code className="mx-1 font-mono text-xs">
						bardo/projections/current-state.md
					</code>
					and then call a Bardo report tool such as
					<code className="mx-1 font-mono text-xs">world_state_overview</code>
					or
					<code className="mx-1 font-mono text-xs">context_query</code>.
				</p>
			</section>
		</DocsShell>
	);
}
