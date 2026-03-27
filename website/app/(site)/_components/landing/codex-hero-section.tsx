"use client";

import type { ReactNode } from "react";

export default function CodexHeroSection() {
	return (
		<section className="relative overflow-hidden pb-24 pt-28">
			<div className="mx-auto flex flex-col items-start">
				<h1
					className="mb-6 font-brand text-6xl font-semibold uppercase tracking-[-0.08em] sm:text-8xl md:text-[9rem]"
					style={{
						animation: "fade-in-up 0.6s ease-out 0.1s forwards",
						opacity: 0,
					}}
				>
					BARDO
				</h1>

				<p
					className="mb-8 max-w-3xl text-md md:text-2xl"
					style={{
						animation: "fade-in-up 0.6s ease-out 0.2s forwards",
						opacity: 0,
					}}
				>
					The MCP for any tabletop role-playing game, <br />
					Bardo is the new best way of building worlds with AI.
				</p>

				<fieldset
					aria-label="Install command"
					className="inline-flex items-center gap-3 rounded-full border border-border bg-card/80 px-4 py-3 font-mono text-sm text-foreground shadow-2xl backdrop-blur"
					style={{
						animation: "fade-in-up 0.6s ease-out 0.2s forwards",
						opacity: 0,
					}}
				>
					<span className="rounded-full border border-border px-2 py-1 text-[10px] uppercase tracking-[1px] text-muted-foreground">
						curl
					</span>
					<code>curl -fsSL https://bardo.gg/install | sh</code>
				</fieldset>
			</div>

			<div
				className="mx-auto mt-14 max-w-6xl px-4 sm:px-6"
				style={{
					animation: "fade-in-up 0.8s ease-out 0.4s forwards",
					opacity: 0,
				}}
			>
				<div className="overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
					<ProductDemoMockup />
				</div>
			</div>
		</section>
	);
}

function ProductDemoMockup() {
	return (
		<div className="flex min-h-[500px] md:min-h-[600px]">
			<div className="hidden w-64 shrink-0 border-r border-border bg-secondary/30 md:block">
				<div className="flex items-center gap-2 border-b border-border px-4 py-3">
					<div className="flex gap-1.5">
						<span className="h-3 w-3 rounded-full bg-muted-foreground/30" />
						<span className="h-3 w-3 rounded-full bg-muted-foreground/30" />
						<span className="h-3 w-3 rounded-full bg-muted-foreground/30" />
					</div>
				</div>

				<div className="p-3">
					<SidebarItem label="New thread" />
					<SidebarItem label="Automations" />
					<SidebarItem label="Skills" />

					<div className="mb-2 mt-6 px-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						Threads
					</div>

					<SidebarGroup title="Iron Duchy">
						<SidebarItem label="Refresh campaign truth" time="4m" active />
						<SidebarItem label="Prepare next session" time="8m" />
					</SidebarGroup>

					<SidebarGroup title="Midnight Hollows">
						<SidebarItem label="Player recap draft" time="2m" />
					</SidebarGroup>

					<SidebarGroup title="Bridge Sessions">
						<SidebarItem label="Approve local write plan" status="Active" />
					</SidebarGroup>

					<SidebarGroup title="Continuity">
						<SidebarItem label="Audit unresolved drift" time="3m" dot />
					</SidebarGroup>
				</div>
			</div>

			<div className="flex flex-1 flex-col">
				<div className="flex items-center justify-between border-b border-border px-4 py-3 md:px-6">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium text-foreground">
							Refresh campaign truth
						</span>
						<span className="text-sm text-muted-foreground">./campaign</span>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary"
						>
							Open
						</button>
						<button
							type="button"
							className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary"
						>
							Commit
						</button>
					</div>
				</div>

				<div className="flex-1 p-4 md:p-6">
					<div className="mb-6 flex justify-end">
						<div className="max-w-md rounded-lg bg-secondary px-4 py-3 text-sm text-foreground">
							Reconcile the latest turn, flag canon drift, and update the local
							campaign files that should change.
						</div>
					</div>

					<div className="mb-6">
						<p className="mb-4 text-sm leading-relaxed text-muted-foreground">
							{
								"I'll read the canonical event log, review the current projection, and prepare a write plan that only touches the local files needed for continuity."
							}
						</p>
						<div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
							<span>Thought 7s</span>
							<span className="text-foreground/20">|</span>
							<span>Explored 2 files</span>
						</div>

						<div className="space-y-2">
							<div className="flex items-center justify-between rounded border border-border bg-secondary/50 px-3 py-2 text-sm">
								<div className="flex items-center gap-2">
									<span className="text-muted-foreground">Edited</span>
									<span className="font-mono text-foreground">
										projections/current-state.md
									</span>
								</div>
								<span className="text-muted-foreground">&#10003;</span>
							</div>
							<div className="flex items-center justify-between rounded border border-border bg-secondary/50 px-3 py-2 text-sm">
								<div className="flex items-center gap-2">
									<span className="text-muted-foreground">Edited</span>
									<span className="font-mono text-foreground">
										logs/continuity-audit.md
									</span>
								</div>
								<span className="text-muted-foreground">&#10003;</span>
							</div>
						</div>
					</div>
				</div>

				<div className="border-t border-border p-4">
					<div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3">
						<input
							type="text"
							placeholder="Ask Bardo to sync your canon"
							className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
							disabled
						/>
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<span>+</span>
							<span>Remote MCP</span>
						</div>
					</div>
				</div>
			</div>

			<div className="hidden w-80 shrink-0 border-l border-border bg-secondary/20 lg:block">
				<div className="border-b border-border px-4 py-3">
					<div className="flex items-center justify-between text-sm">
						<span className="text-foreground">2 files changed</span>
						<span className="font-mono text-xs text-muted-foreground">
							+9 -6
						</span>
					</div>
				</div>
				<div className="p-4">
					<div className="mb-4">
						<div className="mb-2 flex items-center justify-between text-xs">
							<span className="font-mono text-foreground">src/hero.tsx</span>
							<span className="text-muted-foreground">+8 -5</span>
						</div>
						<div className="space-y-1 font-mono text-[11px]">
							<div className="text-muted-foreground">
								{"export const hero = {"}
							</div>
							<div className="bg-foreground/5 text-foreground/70">
								{'  eyebrow: "New",'}
							</div>
							<div className="bg-foreground/5 text-foreground/70">
								{'  scene: "Harbor negotiations",'}
							</div>
							<div className="bg-foreground/5 text-foreground/70">
								{'  status: "canon refreshed",'}
							</div>
							<div className="text-muted-foreground">{"}"}</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function SidebarItem({
	label,
	time,
	status,
	active,
	dot,
}: {
	label: string;
	time?: string;
	status?: string;
	active?: boolean;
	dot?: boolean;
}) {
	return (
		<div
			className={`flex items-center justify-between rounded px-3 py-2 text-sm transition-colors ${
				active
					? "border-l-2 border-foreground bg-muted text-foreground"
					: "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
			}`}
		>
			<div className="flex items-center gap-2">
				{dot && <span className="h-1.5 w-1.5 rounded-full bg-foreground" />}
				<span>{label}</span>
			</div>
			{time && <span className="text-xs text-muted-foreground">{time}</span>}
			{status && (
				<span className="text-xs text-muted-foreground">{status}</span>
			)}
		</div>
	);
}

function SidebarGroup({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="mb-2">
			<div className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground">
				<span className="text-foreground/30">&#9660;</span>
				<span>{title}</span>
			</div>
			<div className="ml-2">{children}</div>
		</div>
	);
}
