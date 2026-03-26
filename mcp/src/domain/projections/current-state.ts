import {
	readTextIfExists,
	resolvePathInsideRoot,
	writeTextAtomic,
} from "../../infra/filesystem/filesystem";
import { parseStateOrThrow } from "../campaign/state";
import type { CampaignState } from "../campaign/types";
import {
	readCanonicalEventLogStats,
	readCanonicalEvents,
} from "../events/store";
import { parseMarkdown, renderMarkdown } from "../markdown/markdown";
import { regenerateWorkspaceReports } from "../reports/workspace-reports";
import { deriveCurrentStateFromEvents } from "./derive-current-state";

export const CURRENT_STATE_PROJECTION_ID = "current_state";
const CURRENT_STATE_PROJECTION_PATH = "projections/current-state.md";
const LEGACY_CURRENT_STATE_PATH = "state/current.md";
const WORLD_STATE_OVERVIEW_PATH = "logs/world-state-overview.md";

export { deriveCurrentStateFromEvents } from "./derive-current-state";

function parsePositiveInteger(value: string | undefined): number | null {
	if (!value) {
		return null;
	}
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return null;
	}
	return parsed;
}

async function loadExistingProjectionState(args: {
	bardoRoot: string;
	projectionPath: string;
}): Promise<{
	raw: string;
	frontmatter: Record<string, string>;
	state: CampaignState;
} | null> {
	const raw = await readTextIfExists(args.projectionPath);
	if (raw === null) {
		return null;
	}
	const parsed = parseMarkdown(raw);
	return {
		raw,
		frontmatter: parsed.frontmatter,
		state: parseStateOrThrow({
			rawBody: parsed.content,
			sourcePath: args.projectionPath,
			allowEmpty: false,
		}),
	};
}

function readStateSnapshotFromEvent(
	event: Readonly<{ data: Record<string, unknown> }> | null,
): CampaignState | null {
	if (!event) {
		return null;
	}
	const snapshot = event.data.stateAfter;
	if (!snapshot || typeof snapshot !== "object") {
		return null;
	}
	return parseStateOrThrow({
		rawBody: JSON.stringify(snapshot),
		sourcePath: "canonical_event.stateAfter",
		allowEmpty: false,
	});
}

export async function regenerateCurrentStateProjection(args: {
	bardoRoot: string;
	regenerateReports?: boolean;
	force?: boolean;
}): Promise<{
	projectionId: typeof CURRENT_STATE_PROJECTION_ID;
	projectionPath: string;
	eventCount: number;
	state: CampaignState;
}> {
	const projectionPath = resolvePathInsideRoot(
		args.bardoRoot,
		CURRENT_STATE_PROJECTION_PATH,
	);
	const legacyStatePath = resolvePathInsideRoot(
		args.bardoRoot,
		LEGACY_CURRENT_STATE_PATH,
	);
	const existingProjection = await loadExistingProjectionState({
		bardoRoot: args.bardoRoot,
		projectionPath,
	});
	const eventStats = await readCanonicalEventLogStats({
		bardoRoot: args.bardoRoot,
	});
	const reportsRequired = args.regenerateReports !== false;
	const reportsExist = await readTextIfExists(
		resolvePathInsideRoot(args.bardoRoot, WORLD_STATE_OVERVIEW_PATH),
	);
	if (!args.force && existingProjection) {
		const projectionSeqMax = parsePositiveInteger(
			existingProjection.frontmatter.source_event_seq_max,
		);
		const projectionCount = parsePositiveInteger(
			existingProjection.frontmatter.source_event_count,
		);
		if (
			projectionSeqMax === eventStats.lastSequence &&
			projectionCount === eventStats.eventCount &&
			(!reportsRequired || reportsExist !== null)
		) {
			return {
				projectionId: CURRENT_STATE_PROJECTION_ID,
				projectionPath,
				eventCount: eventStats.eventCount,
				state: existingProjection.state,
			};
		}
	}

	let events: Awaited<ReturnType<typeof readCanonicalEvents>> = [];
	const latestSnapshotState = readStateSnapshotFromEvent(eventStats.lastEvent);
	let state =
		latestSnapshotState ??
		existingProjection?.state ??
		deriveCurrentStateFromEvents(events);
	if (eventStats.eventCount > 0 && latestSnapshotState === null) {
		events = await readCanonicalEvents({ bardoRoot: args.bardoRoot });
		state = deriveCurrentStateFromEvents(events);
	}
	if (eventStats.eventCount > 0 && events.length === 0 && reportsRequired) {
		events = await readCanonicalEvents({ bardoRoot: args.bardoRoot });
	}
	const rawContent = JSON.stringify(state, null, 2);
	const minSequence = eventStats.eventCount > 0 ? 1 : null;
	const maxSequence =
		eventStats.eventCount > 0 ? eventStats.lastSequence : null;
	const generatedAtISO = new Date().toISOString();
	await writeTextAtomic(
		projectionPath,
		renderMarkdown(
			{
				title: "Current State Projection",
				description:
					"Derived campaign state projection generated from canonical event log",
				projection_schema: "v2",
				generated_at_iso: generatedAtISO,
				source_event_seq_min: minSequence ? String(minSequence) : "0",
				source_event_seq_max: maxSequence ? String(maxSequence) : "0",
				source_event_count: String(eventStats.eventCount),
			},
			rawContent,
		),
	);
	await writeTextAtomic(
		legacyStatePath,
		renderMarkdown(
			{
				title: "Campaign State",
				description: "Current campaign state and memory snapshot",
			},
			rawContent,
		),
	);
	if (reportsRequired) {
		if (events.length === 0 && eventStats.eventCount > 0) {
			events = await readCanonicalEvents({ bardoRoot: args.bardoRoot });
		}
		await regenerateWorkspaceReports({
			bardoRoot: args.bardoRoot,
			state,
			events,
		});
	}

	return {
		projectionId: CURRENT_STATE_PROJECTION_ID,
		projectionPath,
		eventCount: eventStats.eventCount,
		state,
	};
}
