"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export default function IdeDemoSection() {
	const ref = useRef<HTMLElement>(null);
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) {
					setIsVisible(true);
				}
			},
			{ threshold: 0.1 },
		);

		if (ref.current) {
			observer.observe(ref.current);
		}

		return () => observer.disconnect();
	}, []);

	return (
		<section ref={ref} className="py-24">
			<div
				className="overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
				style={{
					opacity: isVisible ? 1 : 0,
					transform: isVisible
						? "translateY(0) scale(1)"
						: "translateY(40px) scale(0.98)",
					transition: "opacity 0.8s ease-out, transform 0.8s ease-out",
				}}
			>
				<FullIdeMockup />
			</div>
		</section>
	);
}

function FullIdeMockup() {
	return (
		<div className="flex min-h-[600px] lg:min-h-[700px]">
			<div className="hidden w-56 shrink-0 border-r border-border bg-secondary/20 md:block">
				<div className="flex items-center gap-2 border-b border-border px-4 py-3">
					<div className="flex gap-1.5">
						<span className="h-3 w-3 rounded-full bg-muted-foreground/30" />
						<span className="h-3 w-3 rounded-full bg-muted-foreground/30" />
						<span className="h-3 w-3 rounded-full bg-muted-foreground/30" />
					</div>
					<span className="ml-auto text-muted-foreground/50">&#9632;</span>
				</div>

				<div className="p-3">
					<SidebarItem label="New thread" />
					<SidebarItem label="Automations" />
					<SidebarItem label="Skills" />

					<div className="mb-2 mt-6 px-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						Threads
					</div>

					<SidebarGroup title="Codex">
						<SidebarItem label="Create Codex app CTA" time="4h" active />
						<SidebarItem label="Implement dark mode" time="8h" />
					</SidebarGroup>

					<SidebarGroup title="ChatGPT">
						<SidebarItem label="Voice mode shortcuts" time="2h" />
					</SidebarGroup>

					<SidebarGroup title="Sora">
						<SidebarItem label="Persist prompt presets" time="5h" />
					</SidebarGroup>

					<SidebarGroup title="Atlas">
						<SidebarItem label="Add Status filter facet" time="3h" />
					</SidebarGroup>
				</div>
			</div>

			<div className="flex flex-1 flex-col">
				<div className="flex items-center justify-between border-b border-border px-4 py-3 md:px-6">
					<div className="flex items-center gap-3">
						<span className="text-sm font-medium text-foreground">
							Create Codex app CTA
						</span>
						<span className="flex items-center gap-1.5 text-sm text-muted-foreground">
							<span className="text-foreground/30">&#9632;</span>
							openai/codex
						</span>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							className="rounded-md border border-border px-4 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary"
						>
							Open
						</button>
						<button
							type="button"
							className="flex items-center gap-1.5 rounded-md border border-border px-4 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary"
						>
							<span className="text-foreground/50">&#9632;</span>
							Commit
						</button>
					</div>
				</div>

				<div className="flex-1 overflow-auto p-4 md:p-6">
					<div className="mb-6 flex justify-end">
						<div className="max-w-md rounded-lg bg-secondary px-4 py-3 text-sm text-foreground">
							Create a compelling launch hero for the new Codex app on
							openai.com/codex
						</div>
					</div>

					<div className="mb-6">
						<p className="mb-4 text-sm leading-relaxed text-muted-foreground">
							{
								"I'll update the hero copy to clearly communicate what Codex app does, add outcome-focused bullets, and ensure the CTAs align with launch goals."
							}
						</p>

						<div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
							<span>Thought 7s</span>
							<span>Explored 2 files</span>
						</div>

						<div className="space-y-2">
							<FileAction file="hero.tsx" status="done" />
							<FileAction file="build.py" status="reading" />
							<FileAction file="build.py" status="done" />
						</div>

						<p className="mt-4 text-sm leading-relaxed text-muted-foreground">
							Updated the launch hero to emphasize real developer outcomes (repo
							understanding, safe execution, PR delivery), and aligned the CTAs
							with launch intent.
						</p>
					</div>
				</div>

				<div className="border-t border-border p-4">
					<div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3">
						<input
							type="text"
							placeholder="Ask Codex anything"
							className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
							disabled
						/>
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground">+</span>
							<span className="text-xs text-muted-foreground">GPT-5.4</span>
							<span className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background">
								&#8593;
							</span>
						</div>
					</div>
				</div>
			</div>

			<div className="hidden w-80 shrink-0 border-l border-border bg-secondary/10 lg:block xl:w-96">
				<div className="flex items-center justify-between border-b border-border px-4 py-3">
					<div className="flex items-center gap-2 text-sm">
						<span className="text-foreground">2 files changed</span>
						<span className="font-mono text-xs text-foreground/50">+9</span>
						<span className="font-mono text-xs text-foreground/30">-6</span>
					</div>
					<div className="flex items-center gap-2 text-muted-foreground">
						<span>&#10005;</span>
						<span>&#10003;</span>
					</div>
				</div>

				<div className="p-4">
					<div className="mb-6">
						<div className="mb-3 flex items-center justify-between">
							<span className="font-mono text-sm text-foreground">
								src/hero.tsx
							</span>
							<div className="flex items-center gap-2">
								<span className="font-mono text-xs text-foreground/50">+8</span>
								<span className="font-mono text-xs text-foreground/30">-5</span>
								<span className="text-muted-foreground">&#10005;</span>
								<span className="text-muted-foreground">&#10003;</span>
							</div>
						</div>

						<div className="space-y-0.5 overflow-hidden rounded border border-border bg-card font-mono text-[11px]">
							<CodeLine text="export const hero = {" />
							<CodeLine text='  eyebrow: "New",' added />
							<CodeLine text='  title: "Codex",' added />
							<CodeLine text='  subtitle: "AI for developers",' added />
							<CodeLine text='  eyebrow: "Introducing",' added />
							<CodeLine text='  title: "Codex app",' added />
							<CodeLine text='  subtitle: "Your AI pair programmer",' added />
							<CodeLine text='  primaryCta: "Get started",' added />
							<CodeLine text='  secondaryCta: "Download the CLI",' added />
							<CodeLine text="};" />
							<CodeLine text="" />
							<CodeLine text="export const heroBullets = [" />
							<CodeLine text='  "Write code faster",' added />
							<CodeLine text='  "Understand any repo",' added />
							<CodeLine text='  "Understands your repo in seconds",' added />
							<CodeLine
								text='  "Executes commands safely in a sandbox",'
								added
							/>
							<CodeLine
								text='  "Turns issues into reviewed, production-ready PRs",'
								added
							/>
							<CodeLine text="];" />
						</div>
					</div>

					<div>
						<div className="mb-3 flex items-center justify-between">
							<span className="font-mono text-sm text-foreground">
								tools/build.py
							</span>
							<div className="flex items-center gap-2">
								<span className="font-mono text-xs text-foreground/50">+1</span>
								<span className="font-mono text-xs text-foreground/30">-1</span>
								<span className="text-muted-foreground">&#10005;</span>
								<span className="text-muted-foreground">&#10003;</span>
							</div>
						</div>

						<div className="space-y-0.5 overflow-hidden rounded border border-border bg-card font-mono text-[11px]">
							<CodeLine text="def build():" />
							<CodeLine text='    print("building")' removed />
							<CodeLine text='    print("building launch hero...")' added />
							<CodeLine text="" />
							<CodeLine text='if __name__ == "__main__":' />
							<CodeLine text="    build()" />
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
	active,
}: {
	label: string;
	time?: string;
	active?: boolean;
}) {
	return (
		<div
			className={`flex items-center justify-between rounded px-3 py-2 text-sm transition-colors ${
				active
					? "bg-muted text-foreground"
					: "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
			}`}
		>
			<span className="truncate">{label}</span>
			{time && <span className="text-xs text-muted-foreground">{time}</span>}
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
		<div className="mb-1">
			<div className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground">
				<span className="text-foreground/30">&#9660;</span>
				<span>{title}</span>
			</div>
			<div className="ml-4">{children}</div>
		</div>
	);
}

function FileAction({
	file,
	status,
}: {
	file: string;
	status: "done" | "reading" | "editing";
}) {
	return (
		<div className="flex items-center justify-between rounded border border-border bg-secondary/50 px-3 py-2 text-sm">
			<div className="flex items-center gap-2">
				<span className="text-muted-foreground">
					{status === "reading" ? "Read" : "Edited"}
				</span>
				<span className="font-mono text-foreground">{file}</span>
			</div>
			<span className="text-muted-foreground">&#10003;</span>
		</div>
	);
}

function CodeLine({
	text,
	added,
	removed,
}: {
	text: string;
	added?: boolean;
	removed?: boolean;
}) {
	return (
		<div
			className={`px-3 py-0.5 ${
				added
					? "bg-foreground/5 text-foreground"
					: removed
						? "bg-foreground/10 text-foreground/50 line-through"
						: "text-muted-foreground"
			}`}
		>
			{text || "\u00A0"}
		</div>
	);
}
