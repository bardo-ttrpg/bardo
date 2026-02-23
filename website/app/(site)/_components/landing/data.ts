import type { LucideIcon } from "lucide-react";
import {
	CheckSquare,
	Database,
	FileText,
	Layers,
	PlayCircle,
	RefreshCw,
} from "lucide-react";
import type { MapMarker } from "@/components/magicui/dotted-map";
import type { FileTreeRoot } from "@/components/magicui/file-tree";

type LandingFeature = {
	icon: LucideIcon;
	label: string;
	desc: string;
};

export const tickerItems = [
	"Claude Code",
	"Cursor",
	"Cline",
	"OpenCode",
	"Codex CLI",
	"Gemini CLI",
	"Any TTRPG System",
	"D&D 5e",
	"Pathfinder",
	"Blades in the Dark",
	"MOTHERSHIP",
	"Persistent State",
	"Markdown-First",
	"MCP Protocol",
] as const;

export const agents = [
	"Claude Code",
	"VS Code + Copilot",
	"Cursor",
	"Cline",
	"OpenCode",
	"Codex CLI",
	"Gemini CLI",
	"Any MCP-capable agent",
] as const;

export const features: readonly LandingFeature[] = [
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
] as const;

export const workflow = [
	{
		n: "01",
		text: "Install Bardo and connect it to your agent via MCP config",
	},
	{ n: "02", text: "Run `bardo init` in your campaign workspace folder" },
	{
		n: "03",
		text: "Your agent reads world.md, state.md, and quests.md to load context",
	},
	{
		n: "04",
		text: "Play sessions that auto-persist state — resume anytime, forever",
	},
] as const;

export const withoutBardoItems = [
	"You re-explain your world every session",
	"State lives in the LLM's context window — until it doesn't",
	"Dice rolls are unstructured, unrepeatable, unauditable",
	"NPCs forget what happened last week",
	"Swapping agents means starting from scratch",
	"Long campaigns collapse under their own complexity",
] as const;

export const withBardoItems = [
	"World state auto-loads on every session init",
	"State persists to markdown files — survives any reset",
	"Every roll goes through a structured MCP tool",
	"NPCs, quests, and factions update after every action",
	"Any MCP-capable agent can resume your campaign",
	"The longer you play, the richer the world gets",
] as const;

export const terminalTools = [
	{
		tool: "state-get",
		desc: "Fetch any character or world object",
	},
	{
		tool: "player-action",
		desc: "Structured roll with modifier + DC",
	},
	{
		tool: "world-sync",
		desc: "Persist changes to markdown files",
	},
	{
		tool: "markdown-read",
		desc: "Load world, state, and quest files",
	},
	{
		tool: "markdown-upsert",
		desc: "Write new lore and session notes",
	},
] as const;

export const bardoWorkspace: FileTreeRoot = {
	name: "./the-iron-duchy/",
	note: "← bardo init creates this",
	children: [
		{
			id: "world",
			name: "world.md",
			type: "file",
			note: "master world document",
		},
		{
			id: "session",
			name: "session.md",
			type: "file",
			note: "current session state",
		},
		{
			id: "rules",
			name: "rules",
			type: "folder",
			children: [
				{
					id: "rules-system",
					name: "system.md",
					type: "file",
					note: "ruleset & house rules",
				},
			],
		},
		{
			id: "npcs",
			name: "npcs",
			type: "folder",
			children: [
				{ id: "npc-halvar", name: "guard-captain-halvar.md", type: "file" },
				{ id: "npc-iara", name: "merchant-iara.md", type: "file" },
			],
		},
		{
			id: "party",
			name: "party",
			type: "folder",
			children: [
				{
					id: "musashi",
					name: "Musashi.md",
					type: "file",
					highlight: true,
					note: "fighter 6 · STR +4",
				},
				{ id: "zara", name: "Zara.md", type: "file" },
				{
					id: "party-state",
					name: "state.md",
					type: "file",
					note: "gold, conditions, relations",
				},
			],
		},
		{
			id: "items",
			name: "items",
			type: "folder",
			children: [{ id: "inventory", name: "inventory.md", type: "file" }],
		},
		{
			id: "locations",
			name: "locations",
			type: "folder",
			children: [
				{ id: "loc-ironhaven", name: "ironhaven.md", type: "file" },
				{ id: "loc-mine", name: "the-old-mine.md", type: "file" },
			],
		},
		{
			id: "quests",
			name: "quests",
			type: "folder",
			children: [
				{ id: "quest-main", name: "main-quest.md", type: "file" },
				{ id: "quest-side", name: "side-quests.md", type: "file" },
			],
		},
	],
};

export const worldMarkers: MapMarker[] = [
	{
		lat: 37.7,
		lng: -122.4,
		location: {
			name: "The Ember Citadel",
			type: "Fantasy · City-State",
			description:
				"A volcanic fortress perched on an eternal caldera. Its Forge Masters craft living metal for the empire's armies.",
		},
	},
	{
		lat: 51.5,
		lng: -0.1,
		location: {
			name: "Misthollow",
			type: "Fantasy · Port City",
			description:
				"Perpetual fog shrouds this merchant city. Thieves' guilds and trading consortiums operate as one shadowed body.",
		},
	},
	{
		lat: 35.6,
		lng: 139.7,
		location: {
			name: "Crystal Spire",
			type: "Sci-Fi · Megacity",
			description:
				"A towering techno-arcane metropolis where ancient ley-lines power quantum processors. Population: 40 million.",
		},
	},
	{
		lat: -33.8,
		lng: 151.2,
		location: {
			name: "Sunken Harbor",
			type: "Fantasy · Coastal City",
			description:
				"Half this city lies beneath the waves. Merfolk diplomats and surface traders negotiate at the tide-line each dawn.",
		},
	},
	{
		lat: 40.7,
		lng: -74,
		location: {
			name: "Irongate",
			type: "Fantasy · Fortress City",
			description:
				"The last stronghold between the Withered Lands and civilization. Its three walls have never been breached.",
		},
	},
	{
		lat: 52.5,
		lng: 13.4,
		location: {
			name: "The Iron Archives",
			type: "Investigation · Library City",
			description:
				"Every secret ever written is stored here. The Archivist-Priests sell information — and silence — at steep prices.",
		},
	},
	{
		lat: 48.8,
		lng: 2.3,
		location: {
			name: "Court of Veils",
			type: "Investigation · Intrigue",
			description:
				"A city of masked nobility and shifting allegiances. No one shows their true face. Assassination is an art form.",
		},
	},
	{
		lat: 19.4,
		lng: -99.1,
		location: {
			name: "Temple of Echoes",
			type: "Fantasy · Ancient Ruin",
			description:
				"Built upon the bones of seven forgotten civilizations. The lowest level is still unexplored — nothing that descends returns the same.",
		},
	},
	{
		lat: -23.5,
		lng: -46.6,
		location: {
			name: "Neon Sprawl",
			type: "Sci-Fi · Megacity",
			description:
				"A lawless corporate megacity where your augmentations determine your social class. The rain never stops here.",
		},
	},
	{
		lat: 55.7,
		lng: 37.6,
		location: {
			name: "Frost Throne",
			type: "Fantasy · Empire Seat",
			description:
				"Capital of the Ice Dominion. The Frost Council has ruled for 400 years — by keeping everyone too cold to rebel.",
		},
	},
	{
		lat: 1.3,
		lng: 103.8,
		location: {
			name: "Nexus Point",
			type: "Sci-Fi · Trade Hub",
			description:
				"Where the trade routes of three galactic empires intersect. Every species, every faction, every danger — all in one station.",
		},
	},
	{
		lat: 28.6,
		lng: 77.2,
		location: {
			name: "The Eternal Market",
			type: "Fantasy · Trade City",
			description:
				"A market that has never closed in recorded history. You can buy anything here — passage to another plane included.",
		},
	},
];
