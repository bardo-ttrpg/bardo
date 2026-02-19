import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Legal",
	description: "Terms, privacy, and AI use policy for Bardo.",
};

const pages = [
	{
		title: "Terms of Service",
		href: "/legal/terms",
		description:
			"Account terms, acceptable use, billing/no-refund policy, and governing law.",
	},
	{
		title: "Privacy Policy",
		href: "/legal/privacy",
		description:
			"What data we collect, why we collect it, retention, and sharing controls.",
	},
	{
		title: "AI Use Policy",
		href: "/legal/ai-policy",
		description:
			"AI output limitations, user responsibility, and safety expectations.",
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
				These pages describe how Bardo handles accounts, API/MCP usage, data,
				and AI-output limits.
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
