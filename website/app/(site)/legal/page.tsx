import Link from "next/link";
import { createPublicMetadata } from "@/lib/site-metadata";

export const metadata = createPublicMetadata({
	title: "Legal",
	description: "Terms, privacy, and AI use policy for Bardo.",
	path: "/legal",
	keywords: [
		"Bardo legal",
		"AI use policy",
		"privacy policy",
		"terms of service",
	],
});

const pages = [
	{
		title: "Terms of Service",
		href: "/legal/terms",
		description:
			"Account terms, acceptable use, monthly-credit billing, and service responsibilities.",
	},
	{
		title: "Privacy Policy",
		href: "/legal/privacy",
		description:
			"What data the hosted website and MCP service collect, and what stays local in your workspace.",
	},
	{
		title: "AI Use Policy",
		href: "/legal/ai-policy",
		description:
			"How Bardo treats canon, inference, user review, and AI-output limitations.",
	},
] as const;

export default function LegalIndexPage() {
	return (
		<div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
			<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				/ Legal
			</p>
			<h1 className="mb-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
				Policies and terms
			</h1>
			<p className="mb-10 max-w-2xl text-sm leading-relaxed text-muted-foreground">
				These pages describe how Bardo handles the website, hosted MCP service,
				local bridge, local workspace files, monthly credits, and AI-output
				limits.
			</p>

			<div className="grid gap-4">
				{pages.map((page) => (
					<Link
						key={page.href}
						href={page.href}
						className="block border border-border p-6 transition-colors hover:border-foreground/40"
					>
						<p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-foreground">
							{page.title}
						</p>
						<p className="text-sm leading-relaxed text-muted-foreground">
							{page.description}
						</p>
					</Link>
				))}
			</div>
		</div>
	);
}
