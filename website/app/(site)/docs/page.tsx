import Link from "next/link";
import { createPublicMetadata } from "@/lib/site-metadata";
import DocsShell from "./_components/docs-shell";

export const metadata = createPublicMetadata({
	title: "Docs",
	description:
		"Install Bardo, connect your MCP client, understand campaign truth, and learn the flat credit model.",
	path: "/docs",
	keywords: [
		"Bardo docs",
		"MCP client setup",
		"AI game master install",
		"campaign truth markdown",
	],
});

const entries = [
	{
		href: "/docs/install",
		title: "Install",
		description:
			"Install the local bridge and understand the exact first commands to run.",
	},
	{
		href: "/docs/connect-client",
		title: "Connect a Client",
		description: "Connect Codex, Claude Code, or another MCP client to Bardo.",
	},
	{
		href: "/docs/campaign-truth",
		title: "How Bardo Stores Campaign Truth",
		description:
			"Learn which local markdown files matter most and how canon stays readable.",
	},
	{
		href: "/docs/credits-and-billing",
		title: "Credits and Billing",
		description: "Understand the flat one-tool-call, one-credit billing model.",
	},
] as const;

export default function DocsIndexPage() {
	return (
		<DocsShell
			eyebrow="Documentation"
			title="Bardo Docs"
			lede="The website stays intentionally small. Use these pages to get started fast, then rely on the local docs inside your workspace for the comprehensive reference."
			currentPath="/docs"
		>
			<section className="grid gap-4 sm:grid-cols-2">
				{entries.map((entry) => (
					<Link
						key={entry.href}
						href={entry.href}
						prefetch={false}
						className="border border-border bg-card/40 p-5 transition-colors hover:border-foreground/40"
					>
						<h2 className="mb-2 font-semibold text-foreground">
							{entry.title}
						</h2>
						<p>{entry.description}</p>
					</Link>
				))}
			</section>
		</DocsShell>
	);
}
