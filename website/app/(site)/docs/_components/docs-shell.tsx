import type { ReactNode } from "react";
import SiteNavLink from "@/components/site-nav-link";

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
	currentPath: string;
	children: ReactNode;
}) {
	return (
		<div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
			<div className="grid gap-12 lg:grid-cols-[250px_minmax(0,1fr)]">
				<aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
					<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						/ Docs
					</p>
					<nav className="space-y-2" aria-label="Docs">
						{DOC_LINKS.map((link) => (
							<SiteNavLink
								key={link.href}
								href={link.href}
								label={link.label}
								className={
									props.currentPath === link.href
										? "block border border-foreground/20 bg-foreground/[0.04] px-3 py-3 font-mono text-[11px] uppercase tracking-widest text-foreground"
										: "block border border-transparent px-3 py-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
								}
							/>
						))}
					</nav>

					<div className="space-y-3 border border-border bg-card/40 p-4">
						<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
							/ Read Locally
						</p>
						<ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
							<li>
								<code className="font-mono text-[11px] text-foreground">
									bardo/docs/quickstart.md
								</code>
							</li>
							<li>
								<code className="font-mono text-[11px] text-foreground">
									projections/current-state.md
								</code>
							</li>
							<li>
								<code className="font-mono text-[11px] text-foreground">
									logs/world-state-overview.md
								</code>
							</li>
							<li>
								<code className="font-mono text-[11px] text-foreground">
									logs/timeline-diff.md
								</code>
							</li>
						</ul>
					</div>
				</aside>

				<div className="min-w-0">
					<div className="border-b border-border pb-8">
						<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
							/ {props.eyebrow}
						</p>
						<h1 className="mb-4 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
							{props.title}
						</h1>
						<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
							{props.lede}
						</p>
					</div>
					<div className="mt-8 space-y-10 text-sm leading-7 text-muted-foreground">
						{props.children}
					</div>
				</div>
			</div>
		</div>
	);
}
