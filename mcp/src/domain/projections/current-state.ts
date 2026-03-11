import {
	resolvePathInsideRoot,
	writeTextAtomic,
} from "../../infra/filesystem/filesystem";
import type { CampaignState } from "../campaign/types";
import { readCanonicalEvents } from "../events/store";
import { renderMarkdown } from "../markdown/markdown";
import { regenerateWorkspaceReports } from "../reports/workspace-reports";
import { deriveCurrentStateFromEvents } from "./derive-current-state";

export const CURRENT_STATE_PROJECTION_ID = "current_state";
const CURRENT_STATE_PROJECTION_PATH = "projections/current-state.md";
const LEGACY_CURRENT_STATE_PATH = "state/current.md";

export { deriveCurrentStateFromEvents } from "./derive-current-state";

export async function regenerateCurrentStateProjection(args: {
	bardoRoot: string;
}): Promise<{
	projectionId: typeof CURRENT_STATE_PROJECTION_ID;
	projectionPath: string;
	eventCount: number;
	state: CampaignState;
}> {
	const events = await readCanonicalEvents({ bardoRoot: args.bardoRoot });
	const state = deriveCurrentStateFromEvents(events);
	const projectionPath = resolvePathInsideRoot(
		args.bardoRoot,
		CURRENT_STATE_PROJECTION_PATH,
	);
	const legacyStatePath = resolvePathInsideRoot(
		args.bardoRoot,
		LEGACY_CURRENT_STATE_PATH,
	);
	const rawContent = JSON.stringify(state, null, 2);
	const minSequence = events.length > 0 ? (events[0]?.sequence ?? null) : null;
	const maxSequence =
		events.length > 0 ? (events[events.length - 1]?.sequence ?? null) : null;
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
				source_event_count: String(events.length),
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
	await regenerateWorkspaceReports({
		bardoRoot: args.bardoRoot,
		state,
		events,
	});

	return {
		projectionId: CURRENT_STATE_PROJECTION_ID,
		projectionPath,
		eventCount: events.length,
		state,
	};
}
