import type { Metadata } from "next";
import DocsShell from "../_components/docs-shell";

export const metadata: Metadata = {
	title: "Credits and Billing",
	description:
		"Understand Bardo's flat one-tool-call, one-credit billing model.",
};

export default function CreditsDocsPage() {
	return (
		<DocsShell
			eyebrow="Credits"
			title="Credits and Billing"
			lede="The billing model stays deliberately simple so users always know what counts and what does not."
		>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">One rule</h2>
				<p>
					<code className="font-mono text-xs">
						1 accepted MCP tool call = 1 credit
					</code>
					.
				</p>
			</section>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					Free actions
				</h2>
				<ul className="space-y-2">
					<li>MCP resources</li>
					<li>MCP prompts</li>
					<li>Initialize/bootstrap flows</li>
					<li>Website browsing and dashboard activity</li>
				</ul>
			</section>
			<section>
				<h2 className="mb-3 text-lg font-semibold text-foreground">
					Dashboard visibility
				</h2>
				<p>
					The dashboard shows remaining credits and the next reset date. No
					hidden dimensions, no feature-pack pricing, and no extra billing
					rules.
				</p>
			</section>
		</DocsShell>
	);
}
