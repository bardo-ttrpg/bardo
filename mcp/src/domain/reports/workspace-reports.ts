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

const REPORT_PATHS: Record<WorldStateReportId, string> = {
	world_state_overview: "logs/world-state-overview.md",
	continuity_audit: "logs/continuity-audit.md",
	timeline_diff: "logs/timeline-diff.md",
	faction_pressure_report: "logs/faction-pressure.md",
	npc_state_delta: "logs/npc-state-delta.md",
	player_knowledge_view: "logs/player-knowledge.md",
	canon_vs_inference_report: "logs/canon-vs-inference.md",
};

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
	events: readonly CanonicalEvent[];
	consistency: Awaited<ReturnType<typeof runConsistencyCheckForRoot>>;
}): string {
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
		]),
		"",
		"## Inference",
		bulletList(findings),
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
		REPORT_PATHS[args.reportId],
	);
	const rawMarkdown = renderMarkdown(
		{
			title: args.reportId.replaceAll("_", " "),
			description: "Derived world-state workspace report",
			generated_at_iso: new Date().toISOString(),
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
	const reportIds = Object.keys(REPORT_PATHS) as WorldStateReportId[];
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
