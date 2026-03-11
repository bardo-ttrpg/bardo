import type { Metadata } from "next";
import InstallCommandCard from "../../_components/landing/install-command-card";
import DocsShell from "../_components/docs-shell";

export const metadata: Metadata = {
	title: "Install",
	description:
		"Install Bardo, log in, connect a client, and initialize a workspace.",
};

export default function InstallDocsPage() {
	return (
		<DocsShell
			eyebrow="Install"
			title="Install Bardo"
			lede="Install the CLI, authenticate if you are using a hosted account, connect your MCP client, and create a local workspace with one command."
		>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					1. Install the CLI
				</h2>
				<InstallCommandCard />
			</section>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					2. Run the first commands
				</h2>
				<div className="border border-border bg-muted/20 p-4 font-mono text-xs text-foreground">
					<p>bardo login</p>
					<p>bardo connect --client codex</p>
					<p>cd ./your-campaign && bardo init</p>
				</div>
			</section>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					3. Read the local docs
				</h2>
				<p>
					After <code className="font-mono text-xs">bardo init</code>, Bardo
					writes a comprehensive docs set to{" "}
					<code className="font-mono text-xs">bardo/docs/</code>. Start with{" "}
					<code className="font-mono text-xs">quickstart.md</code> and
					<code className="font-mono text-xs">
						{" "}
						how-to-read-your-world-state.md
					</code>
					.
				</p>
			</section>
		</DocsShell>
	);
}
