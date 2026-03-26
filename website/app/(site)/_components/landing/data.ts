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
	"Remote MCP",
	"Persistent State",
	"Bridge Approval",
	"Continuity Reports",
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
		label: "Local Campaign Truth",
		desc: "Canon lives in your local workspace files, not in a cloud campaign store controlled by the product.",
	},
	{
		icon: Layers,
		label: "System-Agnostic",
		desc: "Bring your own rules. Bardo tracks continuity, consequences, and world state without forcing a house system on the table.",
	},
	{
		icon: CheckSquare,
		label: "Auditable Canon",
		desc: "The important claims stay grounded in canonical events, readable files, and explicit tool calls. Suggestions stay separate from facts.",
	},
	{
		icon: RefreshCw,
		label: "Remote Premium Guardrails",
		desc: "The hosted MCP handles auth, billing, metering, orchestration, and continuity checks while the bridge keeps local file access on your machine.",
	},
	{
		icon: PlayCircle,
		label: "Client-Agnostic Access",
		desc: "Connect Codex, Claude Code, VS Code, OpenCode, and similar MCP-capable clients through the same local bridge flow.",
	},
	{
		icon: FileText,
		label: "Readable Canon Surface",
		desc: "Your AI agent and your table can inspect projections, events, and report markdown directly from the workspace without hidden cloud state.",
	},
] as const;

export const workflow = [
	{
		n: "01",
		text: "Install the local Bardo bridge and sign in on the website",
	},
	{ n: "02", text: "Connect your preferred MCP client through the bridge" },
	{
		n: "03",
		text: "Approve the bridge session in the browser and point it at your campaign workspace",
	},
	{
		n: "04",
		text: "Use the full remote Bardo toolset to read local canon, return guarded results, and apply validated local writes",
	},
] as const;

export const withoutBardoItems = [
	"You re-explain your world every session",
	"State lives in the LLM's context window — until it doesn't",
	"Canon and suggestion get blended together",
	"NPCs forget what happened last week",
	"Swapping agents means starting from scratch",
	"Long campaigns collapse under their own complexity",
] as const;

export const withBardoItems = [
	"One subscription unlocks the whole Bardo MCP experience",
	"Your campaign workspace stays local and readable",
	"Canon, inference, and suggestion stay clearly separated",
	"Remote tools apply guardrails before they touch local state",
	"Any MCP-capable agent can use the same bridge flow",
	"The product stays small without cloud campaign storage",
] as const;

export const terminalTools = [
	{
		tool: "scene_turn",
		desc: "Resolve a full scene step and refresh canon-backed state",
	},
	{
		tool: "world_state_overview",
		desc: "Read the current continuity snapshot in markdown form",
	},
	{
		tool: "continuity_audit",
		desc: "Flag contradictions, stale threads, and drift signals",
	},
	{
		tool: "player_knowledge_view",
		desc: "Generate the player-safe version of current knowledge",
	},
	{
		tool: "timeline_diff",
		desc: "Explain what changed across the recent canonical window",
	},
] as const;

export const bardoWorkspace: FileTreeRoot = {
	name: "./the-iron-duchy/bardo/",
	note: "← bardo init creates this",
	children: [
		{
			id: "manifest",
			name: "manifest.json",
			type: "file",
			note: "workspace metadata and ruleset",
		},
		{
			id: "docs",
			name: "docs",
			type: "folder",
			children: [
				{
					id: "quickstart",
					name: "quickstart.md",
					type: "file",
					note: "local getting-started guide",
				},
				{
					id: "world-state-doc",
					name: "how-to-read-your-world-state.md",
					type: "file",
					note: "where to read canon fast",
				},
				{
					id: "credits-doc",
					name: "credits-and-billing.md",
					type: "file",
					note: "one subscription, one clear billing model",
				},
			],
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
			id: "world",
			name: "world",
			type: "folder",
			children: [
				{
					id: "world-factions",
					name: "factions",
					type: "folder",
					children: [
						{ id: "faction-harbor", name: "harbor-guild.md", type: "file" },
					],
				},
				{
					id: "world-locations",
					name: "locations",
					type: "folder",
					children: [
						{ id: "loc-ironhaven", name: "ironhaven.md", type: "file" },
					],
				},
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
					note: "fighter 6 · STR +4",
				},
				{
					id: "zara",
					name: "Zara.md",
					type: "file",
				},
			],
		},
		{
			id: "projections",
			name: "projections",
			type: "folder",
			children: [
				{
					id: "current-state",
					name: "current-state.md",
					type: "file",
					highlight: true,
					note: "canon-derived world snapshot",
				},
			],
		},
		{
			id: "state",
			name: "state",
			type: "folder",
			children: [
				{
					id: "legacy-state",
					name: "current.md",
					type: "file",
					note: "legacy-compatible mirror",
				},
			],
		},
		{
			id: "events",
			name: "events",
			type: "folder",
			children: [
				{
					id: "canonical-events",
					name: "canonical.ndjson",
					type: "file",
					note: "append-only canon log",
				},
			],
		},
		{
			id: "logs",
			name: "logs",
			type: "folder",
			children: [
				{
					id: "overview-log",
					name: "world-state-overview.md",
					type: "file",
					note: "read this first for continuity",
				},
				{
					id: "audit-log",
					name: "continuity-audit.md",
					type: "file",
					note: "contradictions and drift",
				},
				{
					id: "timeline-log",
					name: "timeline-diff.md",
					type: "file",
					note: "what changed recently",
				},
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
