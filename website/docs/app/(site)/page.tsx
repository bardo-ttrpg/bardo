import Link from "next/link";
import LazyTerminal from "@/components/lazy-terminal";
import LazyDottedMap from "@/components/lazy-dotted-map";
import HeroVideoDialog from "@/components/magicui/hero-video-dialog";
import NumberTicker from "@/components/magicui/number-ticker";
import { TextReveal } from "@/components/magicui/text-reveal";
import { FileTree } from "@/components/magicui/file-tree";
import type { MapMarker } from "@/components/magicui/dotted-map";
import type { FileTreeRoot } from "@/components/magicui/file-tree";
import {
	Database,
	Layers,
	CheckSquare,
	RefreshCw,
	PlayCircle,
	FileText,
} from "lucide-react";

/* ── Crosshair marker — text-base, offsets tuned for 16 px font ── */
function X({ className = "" }: { className?: string }) {
	return (
		<span
			aria-hidden="true"
			className={`pointer-events-none absolute select-none font-mono text-base leading-none text-foreground/20 ${className}`}
		>
			+
		</span>
	);
}

/* ── Section label ── */
function SectionLabel({ children }: { children: string }) {
	return (
		<p className="mb-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
			/ {children}
		</p>
	);
}

/* ─────────────────────────────────────────────────────────────
   DATA
───────────────────────────────────────────────────────────── */
const agents = [
	"Claude Code",
	"VS Code + Copilot",
	"Cursor",
	"Cline",
	"OpenCode",
	"Codex CLI",
	"Gemini CLI",
	"Any MCP-capable agent",
];

const features = [
	{
		icon: Database,
		label: "Persistent State",
		desc: "Every action, every decision, every gold piece — written to markdown files that survive reboots, context resets, and model swaps.",
	},
	{
		icon: Layers,
		label: "System-Agnostic",
		desc: "D&D 5e, Pathfinder, Blades in the Dark, MOTHERSHIP — Bardo has no opinion about your ruleset. You define the mechanics.",
	},
	{
		icon: CheckSquare,
		label: "Structured Dice & Checks",
		desc: "Attribute lookups, roll modifiers, and DC comparisons happen through MCP tools — not unstructured prompts. Every outcome is auditable.",
	},
	{
		icon: RefreshCw,
		label: "World Sync",
		desc: "NPCs remember what happened. Quests update automatically. The world file reflects your last session, always.",
	},
	{
		icon: PlayCircle,
		label: "Resumable Sessions",
		desc: "Start mid-dungeon on Tuesday with any agent on any machine. Bardo reconstructs full context from the workspace on init.",
	},
	{
		icon: FileText,
		label: "Markdown-First",
		desc: "Your campaign lives in plain text. Read it, edit it, version-control it, share it. No vendor lock-in, no proprietary format.",
	},
];

const workflow = [
	{ n: "01", text: "Install Bardo and connect it to your agent via MCP config" },
	{ n: "02", text: "Run `bardo init` in your campaign workspace folder" },
	{ n: "03", text: "Your agent reads world.md, state.md, and quests.md to load context" },
	{ n: "04", text: "Play sessions that auto-persist state — resume anytime, forever" },
];

const bardoWorkspace: FileTreeRoot = {
	name: "./the-iron-duchy/",
	note: "← bardo init creates this",
	children: [
		{ id: "world", name: "world.md", type: "file", note: "master world document" },
		{ id: "session", name: "session.md", type: "file", note: "current session state" },
		{
			id: "rules", name: "rules", type: "folder",
			children: [
				{ id: "rules-system", name: "system.md", type: "file", note: "ruleset & house rules" },
			],
		},
		{
			id: "npcs", name: "npcs", type: "folder",
			children: [
				{ id: "npc-halvar", name: "guard-captain-halvar.md", type: "file" },
				{ id: "npc-iara", name: "merchant-iara.md", type: "file" },
			],
		},
		{
			id: "party", name: "party", type: "folder",
			children: [
				{ id: "musashi", name: "Musashi.md", type: "file", highlight: true, note: "fighter 6 · STR +4" },
				{ id: "zara", name: "Zara.md", type: "file" },
				{ id: "party-state", name: "state.md", type: "file", note: "gold, conditions, relations" },
			],
		},
		{
			id: "items", name: "items", type: "folder",
			children: [
				{ id: "inventory", name: "inventory.md", type: "file" },
			],
		},
		{
			id: "locations", name: "locations", type: "folder",
			children: [
				{ id: "loc-ironhaven", name: "ironhaven.md", type: "file" },
				{ id: "loc-mine", name: "the-old-mine.md", type: "file" },
			],
		},
		{
			id: "quests", name: "quests", type: "folder",
			children: [
				{ id: "quest-main", name: "main-quest.md", type: "file" },
				{ id: "quest-side", name: "side-quests.md", type: "file" },
			],
		},
	],
};

const worldMarkers: MapMarker[] = [
	{
		lat: 37.7, lng: -122.4,
		location: { name: "The Ember Citadel", type: "Fantasy · City-State", description: "A volcanic fortress perched on an eternal caldera. Its Forge Masters craft living metal for the empire's armies." },
	},
	{
		lat: 51.5, lng: -0.1,
		location: { name: "Misthollow", type: "Fantasy · Port City", description: "Perpetual fog shrouds this merchant city. Thieves' guilds and trading consortiums operate as one shadowed body." },
	},
	{
		lat: 35.6, lng: 139.7,
		location: { name: "Crystal Spire", type: "Sci-Fi · Megacity", description: "A towering techno-arcane metropolis where ancient ley-lines power quantum processors. Population: 40 million." },
	},
	{
		lat: -33.8, lng: 151.2,
		location: { name: "Sunken Harbor", type: "Fantasy · Coastal City", description: "Half this city lies beneath the waves. Merfolk diplomats and surface traders negotiate at the tide-line each dawn." },
	},
	{
		lat: 40.7, lng: -74.0,
		location: { name: "Irongate", type: "Fantasy · Fortress City", description: "The last stronghold between the Withered Lands and civilization. Its three walls have never been breached." },
	},
	{
		lat: 52.5, lng: 13.4,
		location: { name: "The Iron Archives", type: "Investigation · Library City", description: "Every secret ever written is stored here. The Archivist-Priests sell information — and silence — at steep prices." },
	},
	{
		lat: 48.8, lng: 2.3,
		location: { name: "Court of Veils", type: "Investigation · Intrigue", description: "A city of masked nobility and shifting allegiances. No one shows their true face. Assassination is an art form." },
	},
	{
		lat: 19.4, lng: -99.1,
		location: { name: "Temple of Echoes", type: "Fantasy · Ancient Ruin", description: "Built upon the bones of seven forgotten civilizations. The lowest level is still unexplored — nothing that descends returns the same." },
	},
	{
		lat: -23.5, lng: -46.6,
		location: { name: "Neon Sprawl", type: "Sci-Fi · Megacity", description: "A lawless corporate megacity where your augmentations determine your social class. The rain never stops here." },
	},
	{
		lat: 55.7, lng: 37.6,
		location: { name: "Frost Throne", type: "Fantasy · Empire Seat", description: "Capital of the Ice Dominion. The Frost Council has ruled for 400 years — by keeping everyone too cold to rebel." },
	},
	{
		lat: 1.3, lng: 103.8,
		location: { name: "Nexus Point", type: "Sci-Fi · Trade Hub", description: "Where the trade routes of three galactic empires intersect. Every species, every faction, every danger — all in one station." },
	},
	{
		lat: 28.6, lng: 77.2,
		location: { name: "The Eternal Market", type: "Fantasy · Trade City", description: "A market that has never closed in recorded history. You can buy anything here — passage to another plane included." },
	},
];

/* ─────────────────────────────────────────────────────────────
   PAGE
───────────────────────────────────────────────────────────── */
export default function LandingPage() {
	return (
		<div>
			{/* ════════════════════════════════════════
			    HERO
			════════════════════════════════════════ */}
			<section className="mx-auto max-w-7xl px-4 sm:px-6">
				{/* Giant wordmark */}
				<div className="overflow-hidden border-b border-border pb-6 pt-10">
					<p
						className="font-mono font-bold leading-none tracking-tight text-foreground"
						style={{ fontSize: "clamp(68px, 17.5vw, 220px)" }}
					>
						BARDO
					</p>
				</div>

				{/* Hero content — 2-col */}
				<div className="grid grid-cols-1 border-b border-border md:grid-cols-2">
					<div className="border-b border-border py-10 md:border-b-0 md:border-r md:pr-10">
						<p className="mb-6 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
							/ MCP-Driven TTRPG Operations
						</p>
						<h1 className="max-w-sm text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl">
							Turn your AI coding agent into a professional Game Master.
						</h1>
					</div>

					<div className="py-10 md:pl-10">
						<p className="mb-8 max-w-md text-sm leading-relaxed text-muted-foreground">
							Bardo is an MCP toolbox that gives any AI agent a structured,
							state-aware GM process for tabletop RPGs. Stop re-explaining
							your world every session. Start building campaigns that persist.
						</p>
						<div className="flex flex-wrap gap-3">
							<Link
								href="/mpc-docs"
								className="border border-foreground px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
							>
								Read the docs ↗
							</Link>
							<Link
								href="/dashboard"
								prefetch={false}
								className="border border-border px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
							>
								Open Dashboard ↗
							</Link>
						</div>
					</div>
				</div>
			</section>

			{/* ════════════════════════════════════════
			    STATS ROW
			════════════════════════════════════════ */}
			<section className="border-b border-border">
				<div className="mx-auto max-w-7xl px-4 sm:px-6">
					{/*
					  2-col mobile → 4-col sm.
					  Borders per cell instead of divide-* (divide breaks in multi-row grids).
					  Mobile: col0 has border-r + border-b; col1 has border-b; row2 no border-b.
					  SM 4-col: items 0-2 have border-r; no border-b.
					*/}
					<div className="grid grid-cols-2 sm:grid-cols-4">
						{/* MCP tools — col 0, row 0 */}
						<div className="border-b border-r border-border px-6 py-8 sm:border-b-0 sm:px-8">
							<p className="mb-1 font-mono text-3xl font-bold text-foreground">
								<NumberTicker value={7} />
							</p>
							<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								MCP tools
							</p>
						</div>
						{/* State persistent — col 1, row 0 */}
						<div className="border-b border-border px-6 py-8 sm:border-b-0 sm:border-r sm:px-8">
							<p className="mb-1 font-mono text-3xl font-bold text-foreground">
								<NumberTicker value={100} suffix="%" />
							</p>
							<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								State persistent
							</p>
						</div>
						{/* TTRPG systems — col 0, row 1 (mobile) / col 2 sm */}
						<div className="border-r border-border px-6 py-8 sm:px-8">
							<p className="mb-1 font-mono text-3xl font-bold text-foreground">∞</p>
							<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								TTRPG systems
							</p>
						</div>
						{/* Agents supported — col 1, row 1 (mobile) / col 3 sm */}
						<div className="px-6 py-8 sm:px-8">
							<p className="mb-1 font-mono text-3xl font-bold text-foreground">
								<NumberTicker value={8} />
							</p>
							<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Agents supported
							</p>
						</div>
					</div>
				</div>
			</section>

			<div className="mx-auto max-w-7xl px-4 sm:px-6">
				{/* ════════════════════════════════════════
				    WITHOUT / WITH BARDO
				════════════════════════════════════════ */}
				<section className="relative mt-16 border border-border">
					<X className="-left-[5px] -top-[8px]" />
					<X className="-right-[5px] -top-[8px]" />
					<X className="-bottom-[8px] -left-[5px]" />
					<X className="-right-[5px] -bottom-[8px]" />
					<X className="-top-[8px] left-[calc(50%-5px)]" />
					<X className="-bottom-[8px] left-[calc(50%-5px)]" />

					<div className="grid grid-cols-1 sm:grid-cols-2">
						<div className="border-b border-border p-8 sm:border-b-0 sm:border-r">
							<SectionLabel>Without Bardo</SectionLabel>
							<ul className="space-y-3">
								{[
									"You re-explain your world every session",
									"State lives in the LLM's context window — until it doesn't",
									"Dice rolls are unstructured, unrepeatable, unauditable",
									"NPCs forget what happened last week",
									"Swapping agents means starting from scratch",
									"Long campaigns collapse under their own complexity",
								].map((item) => (
									<li key={item} className="flex items-start gap-3">
										<span className="mt-0.5 shrink-0 font-mono text-[11px] text-muted-foreground/40">
											✕
										</span>
										<span className="text-sm text-muted-foreground">{item}</span>
									</li>
								))}
							</ul>
						</div>

						<div className="p-8">
							<SectionLabel>With Bardo</SectionLabel>
							<ul className="space-y-3">
								{[
									"World state auto-loads on every session init",
									"State persists to markdown files — survives any reset",
									"Every roll goes through a structured MCP tool",
									"NPCs, quests, and factions update after every action",
									"Any MCP-capable agent can resume your campaign",
									"The longer you play, the richer the world gets",
								].map((item) => (
									<li key={item} className="flex items-start gap-3">
										<span className="mt-0.5 shrink-0 font-mono text-[11px] text-green-400/70">
											✓
										</span>
										<span className="text-sm text-foreground">{item}</span>
									</li>
								))}
							</ul>
						</div>
					</div>
				</section>

				{/* ════════════════════════════════════════
				    WORKSPACE SETUP
				════════════════════════════════════════ */}
				<section className="mt-16">
					<div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-16">
						{/* Left — explanation */}
						<div>
							<SectionLabel>Local-first workspace</SectionLabel>
							<h2 className="mb-4 text-2xl font-semibold leading-snug tracking-tight text-foreground">
								One command. Full campaign structure.
							</h2>
							<p className="mb-6 text-sm leading-relaxed text-muted-foreground">
								Run <code className="border border-border px-1.5 py-0.5 font-mono text-xs text-foreground">bardo init</code> in any folder and Bardo creates the entire workspace scaffold — directories for NPCs, party members, locations, quests, items, and world lore. Everything in plain markdown.
							</p>
							<p className="mb-6 text-sm leading-relaxed text-muted-foreground">
								Edit your files directly in any editor. Use Git to version your campaign. Drop in any markdown you write and your agent will incorporate it into the next session automatically.
							</p>
							<div className="border border-border bg-card/40 p-4">
								<p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									/ Init command
								</p>
								<code className="font-mono text-sm text-foreground">
									bardo init --workspace ./the-iron-duchy
								</code>
							</div>
						</div>

						{/* Right — file tree */}
						<div className="relative">
							<X className="-left-[5px] -top-[8px]" />
							<X className="-right-[5px] -top-[8px]" />
							<X className="-bottom-[8px] -left-[5px]" />
							<X className="-right-[5px] -bottom-[8px]" />
							<FileTree root={bardoWorkspace} defaultSelectedId="musashi" className="h-full" />
						</div>
					</div>
				</section>

				{/* ════════════════════════════════════════
				    TERMINAL DEMO
				════════════════════════════════════════ */}
				<section className="mt-16">
					<div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-16">
						<div>
							<SectionLabel>See it in action</SectionLabel>
							<h2 className="mb-4 text-2xl font-semibold leading-snug tracking-tight text-foreground">
								A real Bardo session — every tool call visible.
							</h2>
							<p className="text-sm leading-relaxed text-muted-foreground">
								Bardo exposes all GM operations as MCP tools. Your agent calls
								them explicitly — no hallucinated dice rolls, no forgotten NPCs,
								no state drift. What you see in the terminal is exactly what
								happened in the world.
							</p>
						</div>
						<div className="hidden md:flex md:flex-col md:justify-end">
							<ul className="space-y-2">
								{[
									{ tool: "state-get", desc: "Fetch any character or world object" },
									{ tool: "player-action", desc: "Structured roll with modifier + DC" },
									{ tool: "world-sync", desc: "Persist changes to markdown files" },
									{ tool: "markdown-read", desc: "Load world, state, and quest files" },
									{ tool: "markdown-upsert", desc: "Write new lore and session notes" },
								].map(({ tool, desc }) => (
									<li key={tool} className="flex items-center gap-3">
										<code className="shrink-0 border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
											{tool}
										</code>
										<span className="text-xs text-muted-foreground">{desc}</span>
									</li>
								))}
							</ul>
						</div>
					</div>
					<LazyTerminal />
				</section>

				{/* ════════════════════════════════════════
				    VIDEO SECTION
				════════════════════════════════════════ */}
				<section className="mt-16">
					<div className="mb-6">
						<SectionLabel>Demo</SectionLabel>
						<h2 className="text-xl font-semibold tracking-tight text-foreground">
							Watch a full campaign session
						</h2>
					</div>
					<div className="relative">
						<HeroVideoDialog
							className="block dark:hidden"
							animationStyle="from-center"
							videoSrc="https://www.youtube.com/embed/qh3NGpYRG3I?si=4rb-zSdDkVK9qxxb"
							thumbnailSrc="https://startup-template-sage.vercel.app/hero-light.png"
							thumbnailAlt="Bardo demo video"
						/>
						<HeroVideoDialog
							className="hidden dark:block"
							animationStyle="from-center"
							videoSrc="https://www.youtube.com/embed/qh3NGpYRG3I?si=4rb-zSdDkVK9qxxb"
							thumbnailSrc="https://startup-template-sage.vercel.app/hero-dark.png"
							thumbnailAlt="Bardo demo video"
						/>
					</div>
				</section>

				{/* ════════════════════════════════════════
				    COMPATIBLE AGENTS + FEATURE GRID
				════════════════════════════════════════ */}
				<section className="relative mt-16 border border-border">
					<X className="-left-[5px] -top-[8px]" />
					<X className="-right-[5px] -top-[8px]" />
					<X className="-bottom-[8px] -left-[5px]" />
					<X className="-right-[5px] -bottom-[8px]" />
					<X className="-top-[8px] left-[calc(66.666%-5px)] hidden lg:block" />
					<X className="-bottom-[8px] left-[calc(66.666%-5px)] hidden lg:block" />
					<X className="-left-[5px] top-[calc(50%-8px)] hidden lg:block" />
					<X className="-right-[5px] top-[calc(50%-8px)] hidden lg:block" />

					{/* Row 1 */}
					<div className="grid grid-cols-1 lg:grid-cols-3">
						<div className="border-b border-border p-8 lg:col-span-2 lg:border-r">
							<SectionLabel>Compatible Agents</SectionLabel>
							<h2 className="mb-6 text-lg font-semibold tracking-tight">
								Works with your current stack
							</h2>
							<ul className="grid grid-cols-2 gap-x-8 gap-y-2.5">
								{agents.map((agent) => (
									<li key={agent} className="flex items-center gap-2.5">
										<span className="h-px w-3 shrink-0 bg-muted-foreground/40" />
										<span className="text-sm text-muted-foreground">{agent}</span>
									</li>
								))}
							</ul>
						</div>

						<div className="border-b border-border p-8">
							<SectionLabel>Why Bardo</SectionLabel>
							<h2 className="mb-4 text-lg font-semibold tracking-tight">
								Repeatable.
								<br />
								Coherent.
								<br />
								System-agnostic.
							</h2>
							<p className="text-sm leading-relaxed text-muted-foreground">
								Explicit state handling and predictable narrative synchronization
								through markdown-first tooling. No more ad-hoc prompting.
								No more lost campaigns.
							</p>
						</div>
					</div>

					{/* Row 2 — Feature Cells */}
					<div>
						<div className="border-b border-border px-8 py-4">
							<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								/ What Bardo brings to every session
							</p>
						</div>
						{/*
						  6 features — 1-col / 2-col (sm) / 3-col (lg).
						  Explicit per-cell borders instead of divide-* (divide breaks in multi-row grids).
						  Mobile: border-b on items 0-4.
						  SM 2-col: even items (left col) get border-r; last row (4,5) drops border-b.
						  LG 3-col: last col (i%3===2) drops border-r; last row (i>=3) drops border-b.
						*/}
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
							{features.map(({ icon: Icon, label, desc }, i) => (
								<div
									key={label}
									className={[
										"p-8",
										i < 5 ? "border-b border-border" : "",
										i % 2 === 0 ? "sm:border-r" : "",
										i >= 4 ? "sm:border-b-0" : "",
										i % 3 !== 2 ? "lg:border-r" : "lg:border-r-0",
										i >= 3 ? "lg:border-b-0" : "",
									]
										.filter(Boolean)
										.join(" ")}
								>
									<Icon className="mb-4 h-5 w-5 text-muted-foreground/60" />
									<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
										{String(i + 1).padStart(2, "0")}
									</p>
									<h3 className="mb-2 text-sm font-semibold text-foreground">
										{label}
									</h3>
									<p className="text-sm leading-relaxed text-muted-foreground">
										{desc}
									</p>
								</div>
							))}
						</div>
					</div>

					{/* Row 3 — Workflow */}
					<div>
						<div className="border-b border-border px-8 py-4">
							<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								/ Getting started — four steps
							</p>
						</div>
						{/*
						  4 steps — 1-col / 2-col (sm) / 4-col (lg).
						  Mobile: border-b on items 0-2. SM: left col gets border-r; last row drops border-b.
						  LG: items 0-2 get border-r; all drop border-b.
						*/}
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
							{workflow.map(({ n, text }, i) => (
								<div
									key={n}
									className={[
										"p-8",
										i < 3 ? "border-b border-border" : "",
										i % 2 === 0 ? "sm:border-r" : "",
										i >= 2 ? "sm:border-b-0" : "",
										i < 3 ? "lg:border-r" : "",
										"lg:border-b-0",
									]
										.filter(Boolean)
										.join(" ")}
								>
									<span className="mb-3 block font-mono text-[11px] text-muted-foreground/60">
										{n}
									</span>
									<p className="text-sm leading-relaxed text-foreground">{text}</p>
								</div>
							))}
						</div>
					</div>
				</section>
			</div>

			{/* ════════════════════════════════════════
			    TEXT REVEAL — MANIFESTO
			════════════════════════════════════════ */}
			<section className="border-y border-border">
				<div className="mx-auto max-w-5xl">
					<TextReveal
						text="Bardo gives your AI agent the memory, the tools, and the discipline to run tabletop campaigns that persist across sessions, agents, and machines — without losing a single plot thread."
						className="h-[160vh]"
					/>
				</div>
			</section>

			{/* ════════════════════════════════════════
			    WORLD MAP
			════════════════════════════════════════ */}
			<section className="overflow-hidden border-b border-border">
				<div className="mx-auto max-w-7xl px-4 sm:px-6">
					<div className="border-b border-border py-10">
						<SectionLabel>Your world. Any world.</SectionLabel>
						<p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
							Bardo is open standard and agent-agnostic. Whether you're running
							a gritty noir campaign in Chicago or a high-fantasy epic in an
							entirely invented universe, the MCP protocol connects your world
							to any AI stack, anywhere.
						</p>
					</div>
				</div>
				<LazyDottedMap markers={worldMarkers} />
			</section>

			{/* ════════════════════════════════════════
			    BOTTOM CTA STRIP
			════════════════════════════════════════ */}
			<section className="mx-auto max-w-7xl px-4 sm:px-6">
				<div className="relative mt-16 border border-border">
					<X className="-left-[5px] -top-[8px]" />
					<X className="-right-[5px] -top-[8px]" />
					<X className="-bottom-[8px] -left-[5px]" />
					<X className="-right-[5px] -bottom-[8px]" />
					<X className="-top-[8px] left-[calc(50%-5px)]" />
					<X className="-bottom-[8px] left-[calc(50%-5px)]" />

					<div className="grid grid-cols-1 sm:grid-cols-2">
						<div className="border-b border-border p-8 sm:border-b-0 sm:border-r">
							<p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								/ Get started
							</p>
							<p className="text-sm text-muted-foreground">
								One MCP server. Any agent. Any TTRPG system.
							</p>
						</div>
						<div className="flex items-center gap-4 p-8">
							<Link
								href="/mpc-docs"
								className="border border-foreground px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
							>
								Read the docs ↗
							</Link>
							<Link
								href="/sign-up"
								className="border border-border px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
							>
								Sign up ↗
							</Link>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}
