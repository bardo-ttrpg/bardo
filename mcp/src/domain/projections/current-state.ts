import {
	resolvePathInsideRoot,
	writeTextAtomic,
} from "../../infra/filesystem/filesystem";
import { toDisplayName } from "../campaign/naming";
import { safeParseState } from "../campaign/state";
import type { CampaignState } from "../campaign/types";
import type { CanonicalEvent } from "../events/store";
import { readCanonicalEvents } from "../events/store";
import { renderMarkdown } from "../markdown/markdown";

export const CURRENT_STATE_PROJECTION_ID = "current_state";
const CURRENT_STATE_PROJECTION_PATH = "projections/current-state.md";

function asNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const out: string[] = [];
	for (const item of value) {
		if (typeof item !== "string") {
			continue;
		}
		const normalized = item.trim();
		if (normalized.length > 0) {
			out.push(normalized);
		}
	}
	return out;
}

function ensureLocationRecord(state: CampaignState, locationId: string): void {
	if (!state.locations[locationId]) {
		state.locations[locationId] = {
			name: toDisplayName(locationId),
			visits: 0,
			npcIds: [],
		};
	}
}

function applyPlayerActionResolvedEvent(
	state: CampaignState,
	event: CanonicalEvent,
): void {
	const action = asNonEmptyString(event.data.action);
	const worldTimeAfterISO = asNonEmptyString(event.data.worldTimeAfterISO);
	const locationAfter = asNonEmptyString(event.data.locationAfter);
	const createdNpcIds = asStringArray(event.data.createdNpcIds);
	const createdLocationIds = asStringArray(event.data.createdLocationIds);

	if (worldTimeAfterISO) {
		state.worldTimeISO = worldTimeAfterISO;
	}
	if (action) {
		state.lastAction = action;
	}
	for (const createdLocationId of createdLocationIds) {
		ensureLocationRecord(state, createdLocationId);
	}
	if (locationAfter) {
		ensureLocationRecord(state, locationAfter);
		state.currentLocation = locationAfter;
		const location = state.locations[locationAfter];
		if (location) {
			location.visits += 1;
			for (const npcId of createdNpcIds) {
				if (!location.npcIds.includes(npcId)) {
					location.npcIds.push(npcId);
				}
			}
		}
	}
	state.counters.unknownNpc += createdNpcIds.length;
	state.counters.unknownLocation += createdLocationIds.length;
}

function readStateSnapshot(
	data: Record<string, unknown>,
): CampaignState | null {
	const snapshot = data.stateAfter;
	if (!snapshot || typeof snapshot !== "object") {
		return null;
	}
	return safeParseState(JSON.stringify(snapshot));
}

export function deriveCurrentStateFromEvents(
	events: readonly CanonicalEvent[],
): CampaignState {
	let state = safeParseState("");
	const orderedEvents = [...events].sort((a, b) => a.sequence - b.sequence);
	for (const event of orderedEvents) {
		if (event.type === "player_action_resolved") {
			applyPlayerActionResolvedEvent(state, event);
		}
		if (event.type === "world_sync_applied") {
			const snapshot = readStateSnapshot(event.data);
			if (snapshot) {
				state = snapshot;
			}
		}
		if (event.type === "simulation_tick_applied") {
			const snapshot = readStateSnapshot(event.data);
			if (snapshot) {
				state = snapshot;
			}
		}
		if (event.type === "legacy_state_migrated") {
			const snapshot = readStateSnapshot(event.data);
			if (snapshot) {
				state = snapshot;
			}
		}
	}
	return state;
}

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
				projection_schema: "v1",
				generated_at_iso: generatedAtISO,
				source_event_seq_min: minSequence ? String(minSequence) : "0",
				source_event_seq_max: maxSequence ? String(maxSequence) : "0",
				source_event_count: String(events.length),
			},
			rawContent,
		),
	);

	return {
		projectionId: CURRENT_STATE_PROJECTION_ID,
		projectionPath,
		eventCount: events.length,
		state,
	};
}
