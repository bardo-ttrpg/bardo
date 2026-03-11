import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { readCanonicalEvents } from "../domain/events/store";
import { listRulesetAdapters } from "../domain/mechanics/rulesets/registry";
import {
	loadAuthorityPolicy,
	loadTableContract,
} from "../domain/policy/runtime-guards";
import { loadPreferredCurrentState } from "../domain/projections/preferred-state";
import {
	readOrRefreshWorldStateReport,
	WORLD_STATE_REPORTS,
	type WorldStateReportId,
} from "../domain/reports/workspace-reports";
import { resolveBardoRoot } from "../infra/filesystem/filesystem";
import type { AuthContext } from "../types/contracts";

const RECENT_EVENT_DIGEST_LIMIT = 20;

function parseProvenanceInteger(value: string | undefined): number | null {
	if (!value) {
		return null;
	}
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return null;
	}
	return parsed;
}

function projectionProvenance(
	projectionFrontmatter: Record<string, string | undefined>,
) {
	return {
		projectionGeneratedAtISO: projectionFrontmatter.generated_at_iso ?? null,
		sourceEventSequenceMin: parseProvenanceInteger(
			projectionFrontmatter.source_event_seq_min,
		),
		sourceEventSequenceMax: parseProvenanceInteger(
			projectionFrontmatter.source_event_seq_max,
		),
		sourceEventCount: parseProvenanceInteger(
			projectionFrontmatter.source_event_count,
		),
	};
}

function registerWorldStateReportResources(
	server: McpServer,
	auth: AuthContext,
): void {
	const registerReportResource = (args: {
		name: string;
		uri: string;
		title: string;
		description: string;
		reportId: WorldStateReportId;
	}) => {
		server.registerResource(
			args.name,
			args.uri,
			{
				title: args.title,
				description: args.description,
				mimeType: "text/markdown",
			},
			async () => {
				const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
				const report = await readOrRefreshWorldStateReport({
					bardoRoot,
					reportId: args.reportId,
				});
				return {
					contents: [
						{
							uri: args.uri,
							text: report.rawMarkdown,
							mimeType: "text/markdown",
						},
					],
				};
			},
		);
	};

	registerReportResource({
		name: "report_world_state_overview",
		uri: WORLD_STATE_REPORTS.world_state_overview.resourceUri,
		title: "World State Overview Report",
		description:
			"Readable markdown overview of current canon-backed world state.",
		reportId: "world_state_overview",
	});
	registerReportResource({
		name: "report_continuity_audit",
		uri: WORLD_STATE_REPORTS.continuity_audit.resourceUri,
		title: "Continuity Audit Report",
		description:
			"Readable markdown audit for contradictions, stale continuity, and drift.",
		reportId: "continuity_audit",
	});
	registerReportResource({
		name: "report_timeline_diff",
		uri: WORLD_STATE_REPORTS.timeline_diff.resourceUri,
		title: "Timeline Diff Report",
		description: "Readable markdown summary of recent canonical changes.",
		reportId: "timeline_diff",
	});
	registerReportResource({
		name: "report_last_session_diff",
		uri: "resource://reports/last-session-diff",
		title: "Last Session Diff",
		description:
			"Readable markdown alias for the recent timeline diff workflow.",
		reportId: "timeline_diff",
	});
	registerReportResource({
		name: "report_faction_pressure",
		uri: WORLD_STATE_REPORTS.faction_pressure_report.resourceUri,
		title: "Faction Pressure Report",
		description: "Readable markdown report for faction tension and pressure.",
		reportId: "faction_pressure_report",
	});
	registerReportResource({
		name: "report_npc_state_delta",
		uri: WORLD_STATE_REPORTS.npc_state_delta.resourceUri,
		title: "NPC State Delta Report",
		description: "Readable markdown report for NPC changes and evidence.",
		reportId: "npc_state_delta",
	});
	registerReportResource({
		name: "report_player_knowledge",
		uri: WORLD_STATE_REPORTS.player_knowledge_view.resourceUri,
		title: "Player Knowledge Report",
		description: "Readable player-safe markdown summary from the workspace.",
		reportId: "player_knowledge_view",
	});
	registerReportResource({
		name: "report_canon_vs_inference",
		uri: WORLD_STATE_REPORTS.canon_vs_inference_report.resourceUri,
		title: "Canon Vs Inference Report",
		description:
			"Readable markdown separation of canon, inference, and suggestion.",
		reportId: "canon_vs_inference_report",
	});
}

export function registerCoreResourcesAndPrompts(
	server: McpServer,
	auth: AuthContext,
): void {
	const registerPromptVersionPair = (
		name: string,
		config: Parameters<typeof server.registerPrompt>[1],
		handler: Parameters<typeof server.registerPrompt>[2],
	): void => {
		server.registerPrompt(name, config, handler);
		server.registerPrompt(`${name}_v1`, config, handler);
	};

	server.registerResource(
		"campaign_current_summary",
		"resource://campaign/current-summary",
		{
			title: "Campaign Current Summary",
			description:
				"Current campaign summary from preferred state source and canonical event stats.",
			mimeType: "application/json",
		},
		async () => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const preferredState = await loadPreferredCurrentState({
				bardoRoot,
				consumer: "resource_campaign_current_summary",
				refreshStaleProjection: true,
			});
			const events = await readCanonicalEvents({ bardoRoot });
			const projectionFrontmatter = preferredState.projection.frontmatter;
			const payload = {
				contractVersion: "v1",
				stateSource: preferredState.source,
				worldTimeISO: preferredState.chosen.state.worldTimeISO,
				currentLocation: preferredState.chosen.state.currentLocation,
				lastAction: preferredState.chosen.state.lastAction,
				scene: preferredState.chosen.state.scene,
				party: preferredState.chosen.state.party,
				activeThreads: Object.values(
					preferredState.chosen.state.threads,
				).filter((thread) => thread.status !== "resolved"),
				mechanicsContext: preferredState.chosen.state.mechanicsContext,
				locationCount: Object.keys(preferredState.chosen.state.locations)
					.length,
				totalCanonicalEvents: events.length,
				latestCanonicalEvent:
					events.length > 0 ? (events.at(-1) ?? null) : null,
				provenance: {
					projection: {
						projectionSchema:
							projectionFrontmatter.projection_schema ?? "unknown",
						...projectionProvenance(projectionFrontmatter),
					},
					canonicalEvents: {
						total: events.length,
						latestSequence: events.at(-1)?.sequence ?? 0,
					},
				},
			};
			return {
				contents: [
					{
						uri: "resource://campaign/current-summary",
						text: JSON.stringify(payload, null, 2),
						mimeType: "application/json",
					},
				],
			};
		},
	);

	server.registerResource(
		"scene_current",
		"resource://scene/current",
		{
			title: "Current Scene State",
			description:
				"Focused current-scene view derived from preferred current state.",
			mimeType: "application/json",
		},
		async () => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const preferredState = await loadPreferredCurrentState({
				bardoRoot,
				consumer: "resource_scene_current",
				refreshStaleProjection: true,
			});
			const projectionFrontmatter = preferredState.projection.frontmatter;
			const location =
				preferredState.chosen.state.locations[
					preferredState.chosen.state.currentLocation
				] ?? null;
			const payload = {
				contractVersion: "v1",
				stateSource: preferredState.source,
				worldTimeISO: preferredState.chosen.state.worldTimeISO,
				currentLocationId: preferredState.chosen.state.currentLocation,
				currentLocation: location,
				scene: preferredState.chosen.state.scene,
				occupants:
					location?.occupantIds
						.map((npcId) => preferredState.chosen.state.npcs[npcId])
						.filter(Boolean) ?? [],
				provenance: {
					...projectionProvenance(projectionFrontmatter),
				},
			};
			return {
				contents: [
					{
						uri: "resource://scene/current",
						text: JSON.stringify(payload, null, 2),
						mimeType: "application/json",
					},
				],
			};
		},
	);

	server.registerResource(
		"party_status",
		"resource://party/status",
		{
			title: "Party Status",
			description:
				"Party-centric status projection including location, world time, and counters.",
			mimeType: "application/json",
		},
		async () => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const preferredState = await loadPreferredCurrentState({
				bardoRoot,
				consumer: "resource_party_status",
				refreshStaleProjection: true,
			});
			const projectionFrontmatter = preferredState.projection.frontmatter;
			const payload = {
				contractVersion: "v1",
				stateSource: preferredState.source,
				party: {
					...preferredState.chosen.state.party,
					currentLocation: preferredState.chosen.state.currentLocation,
					currentLocationId: preferredState.chosen.state.currentLocation,
					worldTimeISO: preferredState.chosen.state.worldTimeISO,
					lastAction: preferredState.chosen.state.lastAction,
					counters: preferredState.chosen.state.counters,
					knownLocationCount: Object.keys(preferredState.chosen.state.locations)
						.length,
				},
				provenance: {
					...projectionProvenance(projectionFrontmatter),
				},
			};
			return {
				contents: [
					{
						uri: "resource://party/status",
						text: JSON.stringify(payload, null, 2),
						mimeType: "application/json",
					},
				],
			};
		},
	);

	server.registerResource(
		"npc_active_roster",
		"resource://npc/active-roster",
		{
			title: "Active NPC Roster",
			description:
				"NPCs currently associated with the active location in preferred state.",
			mimeType: "application/json",
		},
		async () => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const preferredState = await loadPreferredCurrentState({
				bardoRoot,
				consumer: "resource_npc_active_roster",
				refreshStaleProjection: true,
			});
			const projectionFrontmatter = preferredState.projection.frontmatter;
			const locationId = preferredState.chosen.state.currentLocation;
			const location =
				preferredState.chosen.state.locations[locationId] ?? null;
			const activeNpcs =
				location?.npcIds
					.map((npcId) => preferredState.chosen.state.npcs[npcId])
					.filter(Boolean) ?? [];
			const payload = {
				contractVersion: "v1",
				stateSource: preferredState.source,
				currentLocationId: locationId,
				npcIds: location?.npcIds ?? [],
				npcs: activeNpcs,
				provenance: {
					...projectionProvenance(projectionFrontmatter),
				},
			};
			return {
				contents: [
					{
						uri: "resource://npc/active-roster",
						text: JSON.stringify(payload, null, 2),
						mimeType: "application/json",
					},
				],
			};
		},
	);

	server.registerResource(
		"npcs_roster",
		"resource://npcs/roster",
		{
			title: "NPC Roster",
			description:
				"All introduced or discovered NPCs in the current campaign state.",
			mimeType: "application/json",
		},
		async () => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const preferredState = await loadPreferredCurrentState({
				bardoRoot,
				consumer: "resource_npcs_roster",
				refreshStaleProjection: true,
			});
			const projectionFrontmatter = preferredState.projection.frontmatter;
			const roster = Object.values(preferredState.chosen.state.npcs)
				.filter((npc) => npc.introduced || npc.discovered)
				.sort((left, right) =>
					left.displayName.localeCompare(right.displayName),
				);
			return {
				contents: [
					{
						uri: "resource://npcs/roster",
						text: JSON.stringify(
							{
								contractVersion: "v1",
								stateSource: preferredState.source,
								npcs: roster,
								provenance: {
									...projectionProvenance(projectionFrontmatter),
								},
							},
							null,
							2,
						),
						mimeType: "application/json",
					},
				],
			};
		},
	);

	server.registerResource(
		"threads_open",
		"resource://threads/open",
		{
			title: "Open Threads",
			description:
				"Compact list of unresolved narrative/mechanics threads inferred from recent canonical events.",
			mimeType: "application/json",
		},
		async () => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const preferredState = await loadPreferredCurrentState({
				bardoRoot,
				consumer: "resource_threads_open",
				refreshStaleProjection: true,
			});
			const projectionFrontmatter = preferredState.projection.frontmatter;
			const openThreads = Object.values(
				preferredState.chosen.state.threads,
			).filter((thread) => thread.status !== "resolved");
			return {
				contents: [
					{
						uri: "resource://threads/open",
						text: JSON.stringify(
							{
								contractVersion: "v1",
								stateSource: preferredState.source,
								openThreads,
								provenance: {
									...projectionProvenance(projectionFrontmatter),
								},
							},
							null,
							2,
						),
						mimeType: "application/json",
					},
				],
			};
		},
	);

	server.registerResource(
		"combat_current",
		"resource://combat/current",
		{
			title: "Current Combat State",
			description:
				"Current combat or tactical mechanics context for the active scene.",
			mimeType: "application/json",
		},
		async () => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const preferredState = await loadPreferredCurrentState({
				bardoRoot,
				consumer: "resource_combat_current",
				refreshStaleProjection: true,
			});
			const projectionFrontmatter = preferredState.projection.frontmatter;
			return {
				contents: [
					{
						uri: "resource://combat/current",
						text: JSON.stringify(
							{
								contractVersion: "v1",
								stateSource: preferredState.source,
								combat: {
									active:
										preferredState.chosen.state.mechanicsContext.combatActive,
									initiativeOrder:
										preferredState.chosen.state.mechanicsContext
											.initiativeOrder,
									advantageHints:
										preferredState.chosen.state.mechanicsContext.advantageHints,
									difficultyHint:
										preferredState.chosen.state.mechanicsContext.difficultyHint,
								},
								provenance: {
									...projectionProvenance(projectionFrontmatter),
								},
							},
							null,
							2,
						),
						mimeType: "application/json",
					},
				],
			};
		},
	);

	server.registerResource(
		"rules_current_ruleset_summary",
		"resource://rules/current-ruleset-summary",
		{
			title: "Current Ruleset Summary",
			description: "Current ruleset profile and supported action classes.",
			mimeType: "application/json",
		},
		async () => {
			const configuredRuleset =
				Bun.env.BARDO_DEFAULT_RULESET?.trim() || "d20_v1";
			const adapters = listRulesetAdapters();
			const activeAdapter =
				adapters.find((adapter) => adapter.id === configuredRuleset) ??
				adapters[0];
			const payload = {
				contractVersion: "v1",
				rulesetId: activeAdapter?.id ?? configuredRuleset,
				supportedActionTypes: [...(activeAdapter?.supportedActionTypes ?? [])],
				availableRulesets: adapters.map((adapter) => ({
					rulesetId: adapter.id,
					supportedActionTypes: [...adapter.supportedActionTypes],
					capabilities: adapter.capabilities,
				})),
				notes:
					"Validate with validate_action_against_ruleset before resolve_mechanics.",
			};
			return {
				contents: [
					{
						uri: "resource://rules/current-ruleset-summary",
						text: JSON.stringify(payload, null, 2),
						mimeType: "application/json",
					},
				],
			};
		},
	);

	server.registerResource(
		"table_contract",
		"resource://table/contract",
		{
			title: "Table Contract",
			description:
				"Table contract constraints and tone boundaries used for safe narration.",
			mimeType: "application/json",
		},
		async () => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const tableContract = await loadTableContract({ bardoRoot });
			const payload = {
				contractVersion: "v1",
				...tableContract,
			};
			return {
				contents: [
					{
						uri: "resource://table/contract",
						text: JSON.stringify(payload, null, 2),
						mimeType: "application/json",
					},
				],
			};
		},
	);

	server.registerResource(
		"authority_policy",
		"resource://authority/policy",
		{
			title: "Authority Policy",
			description:
				"Authority boundaries for who decides fiction, mechanics, and safety overrides.",
			mimeType: "application/json",
		},
		async () => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const authorityPolicy = await loadAuthorityPolicy({ bardoRoot });
			const payload = {
				contractVersion: "v1",
				...authorityPolicy,
			};
			return {
				contents: [
					{
						uri: "resource://authority/policy",
						text: JSON.stringify(payload, null, 2),
						mimeType: "application/json",
					},
				],
			};
		},
	);

	server.registerResource(
		"events_recent_digest",
		"resource://events/recent-digest",
		{
			title: "Recent Event Digest",
			description:
				"Most recent canonical events to support lightweight turn context packing.",
			mimeType: "application/json",
		},
		async () => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const events = await readCanonicalEvents({ bardoRoot });
			const recentEvents = events.slice(
				Math.max(0, events.length - RECENT_EVENT_DIGEST_LIMIT),
			);
			return {
				contents: [
					{
						uri: "resource://events/recent-digest",
						text: JSON.stringify(
							{
								contractVersion: "v1",
								totalCanonicalEvents: events.length,
								returnedEvents: recentEvents.length,
								events: recentEvents,
							},
							null,
							2,
						),
						mimeType: "application/json",
					},
				],
			};
		},
	);

	registerWorldStateReportResources(server, auth);

	registerPromptVersionPair(
		"resolve_player_action",
		{
			title: "Resolve Player Action",
			description:
				"Workflow prompt for action resolution using validate_action_against_ruleset, resolve_mechanics, append_event, and regenerate_projection.",
			argsSchema: {
				action: z
					.string()
					.trim()
					.min(1)
					.max(800)
					.describe("Raw player action text to resolve."),
			},
		},
		async ({ action }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const preferredState = await loadPreferredCurrentState({
				bardoRoot,
				consumer: "prompt_resolve_player_action",
				refreshStaleProjection: true,
			});
			return {
				messages: [
					{
						role: "user",
						content: {
							type: "text",
							text:
								`Resolve this player action with deterministic mechanics and canonical event logging: "${action}". ` +
								`Current location: ${preferredState.chosen.state.currentLocation}. ` +
								"Use validate_action_against_ruleset first, then resolve_mechanics, then append any additional canonical events, and finally regenerate_projection.",
						},
					},
				],
			};
		},
	);

	registerPromptVersionPair(
		"run_scene_turn",
		{
			title: "Run Scene Turn",
			description:
				"Workflow prompt for a complete scene turn using scene + party + recent event resources.",
			argsSchema: {
				action: z
					.string()
					.trim()
					.min(1)
					.max(800)
					.describe("Player action text for this scene turn."),
			},
		},
		async ({ action }) => {
			return {
				messages: [
					{
						role: "user",
						content: {
							type: "text",
							text:
								`Run a full scene turn for action: "${action}". ` +
								"Read resource://scene/current, resource://party/status, resource://npcs/roster, and resource://events/recent-digest. Resolve mechanics before narration and append canonical events for state changes.",
						},
					},
				],
			};
		},
	);

	registerPromptVersionPair(
		"generate_session_recap",
		{
			title: "Generate Session Recap",
			description:
				"Workflow prompt for creating recaps from canonical events and current projections.",
			argsSchema: {
				maxBullets: z
					.number()
					.int()
					.min(3)
					.max(20)
					.default(8)
					.describe("Maximum number of recap bullets."),
			},
		},
		async ({ maxBullets }) => {
			return {
				messages: [
					{
						role: "user",
						content: {
							type: "text",
							text:
								`Create a concise session recap with at most ${String(maxBullets)} bullets. ` +
								"Base it on resource://events/recent-digest, resource://campaign/current-summary, and resource://scene/current.",
						},
					},
				],
			};
		},
	);

	registerPromptVersionPair(
		"adjudicate_ambiguous_rule",
		{
			title: "Adjudicate Ambiguous Rule",
			description:
				"Workflow prompt for handling ambiguous rule calls with explicit assumptions and follow-up actions.",
			argsSchema: {
				ruleQuestion: z
					.string()
					.trim()
					.min(1)
					.max(800)
					.describe("Rule ambiguity question to adjudicate."),
			},
		},
		async ({ ruleQuestion }) => {
			return {
				messages: [
					{
						role: "user",
						content: {
							type: "text",
							text:
								`Adjudicate this ambiguous rule safely: "${ruleQuestion}". ` +
								"Use resource://rules/current-ruleset-summary and resource://authority/policy. Provide ruling, assumptions, and any follow-up canonical events needed.",
						},
					},
				],
			};
		},
	);

	registerPromptVersionPair(
		"safety_pause_and_reframe",
		{
			title: "Safety Pause and Reframe",
			description:
				"Workflow prompt for pausing content, acknowledging boundaries, and reframing the scene safely.",
			argsSchema: {
				boundary: z
					.string()
					.trim()
					.min(1)
					.max(300)
					.describe("Boundary or concern to enforce."),
			},
		},
		async ({ boundary }) => {
			return {
				messages: [
					{
						role: "user",
						content: {
							type: "text",
							text:
								`Run a safety pause for boundary: "${boundary}". ` +
								"Acknowledge boundary, propose a safe reframe, confirm consent, and then resume scene framing under resource://table/contract.",
						},
					},
				],
			};
		},
	);

	registerPromptVersionPair(
		"advance_world_between_sessions",
		{
			title: "Advance World Between Sessions",
			description:
				"Workflow prompt for controlled between-session world progression.",
			argsSchema: {
				tickCount: z
					.number()
					.int()
					.min(1)
					.max(5)
					.default(1)
					.describe("How many bounded scheduled ticks to apply."),
			},
		},
		async ({ tickCount }) => {
			return {
				messages: [
					{
						role: "user",
						content: {
							type: "text",
							text:
								`Advance the world between sessions with ${String(tickCount)} scheduled tick(s). ` +
								"Use simulation_tick with mode=scheduled, append resulting canonical events, regenerate projections, and summarize material changes.",
						},
					},
				],
			};
		},
	);
}
