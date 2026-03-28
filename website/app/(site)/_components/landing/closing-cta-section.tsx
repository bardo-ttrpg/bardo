import Link from "next/link";

export default function ClosingCtaSection() {
	return (
		<section className="border-t border-border py-24">
			<div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end">
				<div>
					<p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
						Start small. Keep the canon intact.
					</p>
					<h2 className="max-w-xl text-4xl leading-none text-foreground md:text-5xl">
						Install Bardo, connect one client, and run your next session against
						a real workspace.
					</h2>
				</div>

				<div className="lg:justify-self-end">
					<p className="max-w-xl text-sm leading-7 text-muted-foreground sm:text-[15px]">
						The first setup is intentionally short: install the bridge, choose
						the campaign directory, then let your AI client work through a
						reviewable remote MCP instead of a hidden state machine.
					</p>
					<div className="mt-8 flex flex-wrap items-center gap-3">
						<Link
							href="/docs/install"
							prefetch={false}
							className="site-button-primary"
						>
							Install Bardo
						</Link>
						<Link
							href="/pricing"
							prefetch={false}
							className="site-button-secondary"
						>
							View pricing
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
}
