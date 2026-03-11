import { readFile } from "node:fs/promises";
import {
	resolvePathInsideRoot,
	writeTextAtomic,
} from "../../infra/filesystem/filesystem";
import type { CampaignState, FactionState, NpcState } from "../campaign/types";
import { runConsistencyCheckForRoot } from "../consistency/check";
import type { CanonicalEvent } from "../events/store";
import { readCanonicalEvents } from "../events/store";
import { renderMarkdown } from "../markdown/markdown";
import { deriveCurrentStateFromEvents } from "../projections/derive-current-state";
import { loadPreferredCurrentState } from "../projections/preferred-state";

export type WorldStateReportId =
	| "world_state_overview"
	| "continuity_audit"
	| "timeline_diff"
	| "faction_pressure_report"
	| "npc_state_delta"
	| "player_knowledge_view"
	| "canon_vs_inference_report";

type ReportOptions = {
	sinceSequence?: number;
	playerView?: boolean;
};

export const WORLD_STATE_REPORTS = {
	world_state_overview: {
		path: "logs/world-state-overview.md",
		resourceUri: "resource://reports/world-state-overview",
		title: "World State Overview",
	},
	continuity_audit: {
		path: "logs/continuity-audit.md",
		resourceUri: "resource://reports/continuity-audit",
		title: "Continuity Audit",
	},
	timeline_diff: {
		path: "logs/timeline-diff.md",
		resourceUri: "resource://reports/timeline-diff",
		title: "Timeline Diff",
	},
	faction_pressure_report: {
		path: "logs/faction-pressure.md",
		resourceUri: "resource://reports/faction-pressure",
		title: "Faction Pressure",
	},
	npc_state_delta: {
		path: "logs/npc-state-delta.md",
		resourceUri: "resource://reports/npc-state-delta",
		title: "NPC State Delta",
	},
	player_knowledge_view: {
		path: "logs/player-knowledge.md",
		resourceUri: "resource://reports/player-knowledge",
		title: "Player Knowledge",
	},
	canon_vs_inference_report: {
		path: "logs/canon-vs-inference.md",
		resourceUri: "resource://reports/canon-vs-inference",
		title: "Canon Vs Inference",
	},
} as const satisfies Record<
	WorldStateReportId,
	{ path: string; resourceUri: string; title: string }
>;

function reportPath(reportId: WorldStateReportId): string {
	return WORLD_STATE_REPORTS[reportId].path;
}

function reportResourceUri(reportId: WorldStateReportId): string {
	return WORLD_STATE_REPORTS[reportId].resourceUri;
}

function bulletList(
	items: readonly string[],
	empty = "- None recorded.",
): string {
	if (items.length === 0) {
		return empty;
	}
	return items.map((item) => `- ${item}`).join("\n");
}

function recentEvents(
	events: readonly CanonicalEvent[],
	limit = 5,
): CanonicalEvent[] {
	return events.slice(Math.max(0, events.length - limit));
}

function evidenceFilesForReport(reportId: WorldStateReportId): string[] {
	return [
		"events/canonical.ndjson",
		"projections/current-state.md",
		"state/current.md",
		reportPath(reportId),
	];
}

function evidenceSummary(args: {
	reportId: WorldStateReportId;
	events: readonly CanonicalEvent[];
}): string {
	const recent = recentEvents(args.events)
		.map((event) => `#${String(event.sequence)} ${event.id}`)
		.join(", ");
	return `files=${evidenceFilesForReport(args.reportId).join(", ")}; recent_event_ids=${recent || "none"}`;
}

function introducedNpcEntries(state: CampaignState): NpcState[] {
	return Object.values(state.npcs)
		.filter((npc) => npc.introduced || npc.discovered)
		.sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function activeFactionEntries(state: CampaignState): FactionState[] {
	return Object.values(state.factions).sort((left, right) => {
		if (right.pressure !== left.pressure) {
			return right.pressure - left.pressure;
		}
		return left.name.localeCompare(right.name);
	});
}

function renderWorldStateOverview(args: {
	state: CampaignState;
	events: readonly CanonicalEvent[];
}): string {
	const npcRoster = introducedNpcEntries(args.state)
		.slice(0, 5)
		.map((npc) => `${npc.displayName} (${npc.id}) @ ${npc.currentLocation}`);
	const openThreads = Object.values(args.state.threads)
		.filter((thread) => thread.status !== "resolved")
		.map((thread) => `${thread.title} [${thread.urgency}]`);
	const hotFactions = activeFactionEntries(args.state)
		.filter((faction) => faction.pressure > 0 || faction.openConflict)
		.slice(0, 5)
		.map(
			(faction) =>
				`${faction.name} (pressure ${String(faction.pressure)}, stance ${faction.stance}${faction.openConflict ? ", open conflict" : ""})`,
		);
	return [
		"# World State Overview",
		"",
		"## Canon",
		bulletList([
			`Current location: ${args.state.currentLocation}`,
			`World time: ${args.state.worldTimeISO}`,
			`Last action: ${args.state.lastAction}`,
			`Known locations: ${String(Object.keys(args.state.locations).length)}`,
			`Known NPCs: ${String(Object.keys(args.state.npcs).length)}`,
			`Open threads: ${String(openThreads.length)}`,
			`Recent evidence: ${
				recentEvents(args.events)
					.map((event) => `${event.id} (${event.type})`)
					.join(", ") || "none"
			}`,
			`Evidence references: ${evidenceSummary({
				reportId: "world_state_overview",
				events: args.events,
			})}`,
		]),
		"",
		"## Inference",
		bulletList([
			`Who matters now: ${npcRoster.join(", ") || "no introduced NPCs are in canon yet"}`,
			`Tensions rising: ${hotFactions.join(", ") || "no faction pressure has been recorded yet"}`,
			`Unresolved focus: ${openThreads.join(", ") || "no unresolved threads are currently tracked"}`,
		]),
		"",
		"## Suggestion",
		bulletList([
			"Use continuity_audit when canon looks incomplete or contradictory.",
			"Review projections/current-state.md before accepting any inferred consequence as table truth.",
		]),
	].join("\n");
}

function renderContinuityAudit(args: {
	state: CampaignState;
	events: readonly CanonicalEvent[];
	consistency: Awaited<ReturnType<typeof runConsistencyCheckForRoot>>;
}): string {
	const unresolvedThreads = Object.values(args.state.threads).filter(
		(thread) => thread.status !== "resolved",
	);
	const staleNpcRisk = introducedNpcEntries(args.state)
		.filter(
			(npc) =>
				!recentEvents(args.events).some((event) =>
					Array.isArray(event.data.createdNpcIds)
						? event.data.createdNpcIds.includes(npc.id)
						: false,
				),
		)
		.slice(0, 5)
		.map((npc) => npc.displayName);
	const highPressureFactions = activeFactionEntries(args.state)
		.filter((faction) => faction.pressure >= 3 || faction.openConflict)
		.map((faction) => `${faction.name} [pressure ${String(faction.pressure)}]`);
	const findings =
		args.consistency.issues.length > 0
			? args.consistency.issues.map((issue) => {
					const pathSuffix = issue.path ? ` @ ${issue.path}` : "";
					return `${issue.code}: ${issue.message}${pathSuffix}`;
				})
			: ["No blocking or warning-level consistency issues were found."];
	return [
		"# Continuity Audit",
		"",
		"## Canon",
		bulletList([
			`Consistency check: ${args.consistency.message}`,
			`Errors: ${String(args.consistency.errorCount)}`,
			`Warnings: ${String(args.consistency.warningCount)}`,
			"Evidence files: events/canonical.ndjson, projections/current-state.md, state/current.md",
			`Latest canonical event: ${args.events.at(-1)?.id ?? "none"}`,
			`Evidence references: ${evidenceSummary({
				reportId: "continuity_audit",
				events: args.events,
			})}`,
		]),
		"",
		"## Inference",
		bulletList([
			...findings,
			`Open unresolved threads: ${unresolvedThreads.length > 0 ? unresolvedThreads.map((thread) => thread.title).join(", ") : "none"}`,
			`NPCs without recent direct evidence: ${staleNpcRisk.join(", ") || "none detected"}`,
			`High-pressure factions to review: ${highPressureFactions.join(", ") || "none detected"}`,
		]),
		"",
		"## Suggestion",
		bulletList([
			"Treat warnings as review items before you promote inferred facts into canon.",
			"If drift appears, compare events/canonical.ndjson against projections/current-state.md and regenerate before play continues.",
		]),
	].join("\n");
}

function renderTimelineDiff(args: {
	events: readonly CanonicalEvent[];
	options?: ReportOptions;
}): string {
	const sinceSequence = Math.max(
		0,
		args.options?.sinceSequence ?? Math.max(0, args.events.length - 5),
	);
	const filtered = args.events.filter(
		(event) => event.sequence > sinceSequence,
	);
	return [
		"# Timeline Diff",
		"",
		"## Canon",
		bulletList([
			`Since sequence ${String(sinceSequence)}`,
			...filtered.map(
				(event) =>
					`#${String(event.sequence)} ${event.id} (${event.type}) at ${event.atISO}`,
			),
			`Evidence references: ${evidenceSummary({
				reportId: "timeline_diff",
				events: filtered,
			})}`,
		]),
		"",
		"## Inference",
		bulletList([
			filtered.length > 0
				? `${String(filtered.length)} canonical change(s) landed in this window.`
				: "No new canonical events landed after the requested sequence.",
			filtered.some((event) => event.type === "player_action_resolved")
				? "Player-facing world state changed in this interval."
				: "Recent changes are mostly background or synchronization events.",
		]),
		"",
		"## Suggestion",
		bulletList([
			"Use the event ids above when you want to manually inspect exact changes in events/canonical.ndjson.",
		]),
	].join("\n");
}

function renderFactionPressure(args: { state: CampaignState }): string {
	const factions = activeFactionEntries(args.state);
	return [
		"# Faction Pressure",
		"",
		"## Canon",
		bulletList(
			factions.map(
				(faction) =>
					`${faction.name} [${faction.id}] pressure=${String(faction.pressure)} stance=${faction.stance}${faction.openConflict ? " open_conflict=true" : ""}`,
			),
			`Evidence references: ${evidenceSummary({
				reportId: "faction_pressure_report",
				events: [],
			})}`,
		),
		"",
		"## Inference",
		bulletList([
			factions.some((faction) => faction.openConflict || faction.pressure >= 3)
				? "At least one faction is under visible strain or active conflict."
				: "No faction has enough recorded pressure to imply imminent escalation yet.",
		]),
		"",
		"## Suggestion",
		bulletList([
			"If faction pressure feels wrong, sync updated faction outcomes into canon before the next scene.",
		]),
	].join("\n");
}

function renderNpcStateDelta(args: {
	state: CampaignState;
	events: readonly CanonicalEvent[];
}): string {
	const npcs = introducedNpcEntries(args.state);
	const recentNpcEvents = recentEvents(args.events).filter((event) => {
		const createdNpcIds = Array.isArray(event.data.createdNpcIds)
			? event.data.createdNpcIds
			: [];
		return createdNpcIds.length > 0;
	});
	const eventNpcIds = recentNpcEvents.flatMap((event) =>
		Array.isArray(event.data.createdNpcIds)
			? event.data.createdNpcIds.filter(
					(npcId): npcId is string => typeof npcId === "string",
				)
			: [],
	);
	return [
		"# NPC State Delta",
		"",
		"## Canon",
		bulletList([
			...npcs.map(
				(npc) =>
					`${npc.displayName} [${npc.id}] disposition=${npc.disposition} location=${npc.currentLocation}`,
			),
			...eventNpcIds.map((npcId) => `Event-backed NPC id: ${npcId}`),
			`Recent NPC evidence: ${recentNpcEvents.map((event) => event.id).join(", ") || "none"}`,
			`Evidence references: ${evidenceSummary({
				reportId: "npc_state_delta",
				events: recentNpcEvents,
			})}`,
		]),
		"",
		"## Inference",
		bulletList([
			npcs.length > 0
				? `Who matters now: ${npcs
						.slice(0, 5)
						.map((npc) => npc.displayName)
						.join(", ")}`
				: "No introduced or discovered NPCs are currently tracked.",
		]),
		"",
		"## Suggestion",
		bulletList([
			"Add explicit world_sync outcomes when NPC roles or dispositions change in play.",
		]),
	].join("\n");
}

function renderPlayerKnowledge(args: {
	state: CampaignState;
	options?: ReportOptions;
}): string {
	const npcs = introducedNpcEntries(args.state).map(
		(npc) => `${npc.displayName} (${npc.currentLocation})`,
	);
	const openThreads = Object.values(args.state.threads)
		.filter((thread) => thread.status !== "resolved")
		.map((thread) => thread.title);
	const label = args.options?.playerView
		? "Player-safe view generated for direct table reading."
		: "Player-safe knowledge view.";
	return [
		"# Player Knowledge",
		"",
		"## Canon",
		bulletList([
			label,
			`Current location: ${args.state.currentLocation}`,
			`Known NPCs: ${npcs.join(", ") || "none recorded"}`,
			`Open threads visible to the table: ${openThreads.join(", ") || "none recorded"}`,
			`Evidence references: files=${evidenceFilesForReport("player_knowledge_view").join(", ")}`,
		]),
		"",
		"## Inference",
		bulletList([
			openThreads.length > 0
				? "The table still has unresolved leads worth pursuing."
				: "The current record does not show unresolved player-facing obligations.",
		]),
		"",
		"## Suggestion",
		bulletList([
			"Keep this view player-safe by promoting only confirmed discoveries into canon.",
		]),
	].join("\n");
}

function renderCanonVsInference(args: {
	state: CampaignState;
	events: readonly CanonicalEvent[];
}): string {
	return [
		"# Canon vs Inference",
		"",
		"## Canon",
		bulletList([
			`Canonical events recorded: ${String(args.events.length)}`,
			`Current location from canon-derived state: ${args.state.currentLocation}`,
			`Last action from canon-derived state: ${args.state.lastAction}`,
			`Evidence references: ${evidenceSummary({
				reportId: "canon_vs_inference_report",
				events: args.events,
			})}`,
		]),
		"",
		"## Inference",
		bulletList([
			"Active location and unresolved threads imply where the table's attention is concentrated right now.",
			"Faction pressure and NPC presence suggest likely social or political friction, but they are not canon on their own.",
		]),
		"",
		"## Suggestion",
		bulletList([
			"Promote a suggestion into canon only by capturing it in a future canonical event.",
		]),
	].join("\n");
}

function renderReport(args: {
	reportId: WorldStateReportId;
	state: CampaignState;
	events: readonly CanonicalEvent[];
	consistency: Awaited<ReturnType<typeof runConsistencyCheckForRoot>>;
	options?: ReportOptions;
}): string {
	switch (args.reportId) {
		case "world_state_overview":
			return renderWorldStateOverview(args);
		case "continuity_audit":
			return renderContinuityAudit(args);
		case "timeline_diff":
			return renderTimelineDiff(args);
		case "faction_pressure_report":
			return renderFactionPressure(args);
		case "npc_state_delta":
			return renderNpcStateDelta(args);
		case "player_knowledge_view":
			return renderPlayerKnowledge(args);
		case "canon_vs_inference_report":
			return renderCanonVsInference(args);
	}
}

async function writeReport(args: {
	bardoRoot: string;
	reportId: WorldStateReportId;
	state: CampaignState;
	events: readonly CanonicalEvent[];
	consistency: Awaited<ReturnType<typeof runConsistencyCheckForRoot>>;
	options?: ReportOptions;
}): Promise<{
	reportId: WorldStateReportId;
	filePath: string;
	rawMarkdown: string;
}> {
	const filePath = resolvePathInsideRoot(
		args.bardoRoot,
		reportPath(args.reportId),
	);
	const rawMarkdown = renderMarkdown(
		{
			title: WORLD_STATE_REPORTS[args.reportId].title,
			description: "Derived world-state workspace report",
			generated_at_iso: new Date().toISOString(),
			report_uri: reportResourceUri(args.reportId),
		},
		renderReport(args),
	);
	await writeTextAtomic(filePath, rawMarkdown);
	return {
		reportId: args.reportId,
		filePath,
		rawMarkdown,
	};
}

export async function regenerateWorkspaceReports(args: {
	bardoRoot: string;
	state: CampaignState;
	events: readonly CanonicalEvent[];
}): Promise<
	Array<{ reportId: WorldStateReportId; filePath: string; rawMarkdown: string }>
> {
	const consistency = await runConsistencyCheckForRoot({
		bardoRoot: args.bardoRoot,
		includeWarnings: true,
	});
	const reportIds = Object.keys(WORLD_STATE_REPORTS) as WorldStateReportId[];
	const written: Array<{
		reportId: WorldStateReportId;
		filePath: string;
		rawMarkdown: string;
	}> = [];
	for (const reportId of reportIds) {
		written.push(
			await writeReport({
				bardoRoot: args.bardoRoot,
				reportId,
				state: args.state,
				events: args.events,
				consistency,
			}),
		);
	}
	return written;
}

export async function readOrRefreshWorldStateReport(args: {
	bardoRoot: string;
	reportId: WorldStateReportId;
	options?: ReportOptions;
}): Promise<{
	reportId: WorldStateReportId;
	filePath: string;
	rawMarkdown: string;
}> {
	const events = await readCanonicalEvents({ bardoRoot: args.bardoRoot });
	const state =
		events.length > 0
			? deriveCurrentStateFromEvents(events)
			: (
					await loadPreferredCurrentState({
						bardoRoot: args.bardoRoot,
						consumer: `report_${args.reportId}`,
						refreshStaleProjection: true,
					})
				).chosen.state;
	const consistency = await runConsistencyCheckForRoot({
		bardoRoot: args.bardoRoot,
		includeWarnings: true,
	});
	const written = await writeReport({
		bardoRoot: args.bardoRoot,
		reportId: args.reportId,
		state,
		events,
		consistency,
		options: args.options,
	});
	return {
		...written,
		rawMarkdown:
			(await readFile(written.filePath, "utf8").catch(
				() => written.rawMarkdown,
			)) ?? written.rawMarkdown,
	};
}
