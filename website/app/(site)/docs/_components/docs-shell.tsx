import Link from "next/link";
import type { ReactNode } from "react";

const DOC_LINKS = [
	{ href: "/docs/install", label: "Install" },
	{ href: "/docs/connect-client", label: "Connect a Client" },
	{ href: "/docs/campaign-truth", label: "Campaign Truth" },
	{ href: "/docs/credits-and-billing", label: "Credits & Billing" },
] as const;

export default function DocsShell(props: {
	eyebrow: string;
	title: string;
	lede: string;
	children: ReactNode;
}) {
	return (
		<div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
			<div className="grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)]">
				<aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
					<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						/ Docs
					</p>
					<nav className="space-y-3" aria-label="Docs">
						{DOC_LINKS.map((link) => (
							<Link
								key={link.href}
								href={link.href}
								prefetch={false}
								className="block font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
							>
								{link.label}
							</Link>
						))}
					</nav>
				</aside>

				<div>
					<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						/ {props.eyebrow}
					</p>
					<h1 className="mb-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
						{props.title}
					</h1>
					<p className="mb-10 max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{props.lede}
					</p>
					<div className="space-y-10 text-sm leading-7 text-muted-foreground">
						{props.children}
					</div>
				</div>
			</div>
		</div>
	);
}
