import { regenerateCurrentStateProjection } from "./current-state";

export type ProjectionId = "current_state";

const PROJECTION_EVENT_DEPENDENCIES: Record<ProjectionId, readonly string[]> = {
	current_state: [
		"campaign_initialized",
		"player_action_resolved",
		"world_sync_applied",
		"simulation_tick_applied",
		"legacy_state_migrated",
	],
};

export function latestRelevantEventSequenceForProjection(args: {
	projectionId: ProjectionId;
	events: ReadonlyArray<{ type: string; sequence: number }>;
}): number {
	const dependencies = new Set(
		PROJECTION_EVENT_DEPENDENCIES[args.projectionId] ?? [],
	);
	let latestSequence = 0;
	for (const event of args.events) {
		if (
			dependencies.has(event.type) &&
			Number.isFinite(event.sequence) &&
			event.sequence > latestSequence
		) {
			latestSequence = event.sequence;
		}
	}
	return latestSequence;
}

export function projectionIdsForEventTypes(
	eventTypes: readonly string[],
): ProjectionId[] {
	const incoming = new Set(eventTypes);
	const matched: ProjectionId[] = [];
	for (const [projectionId, dependencies] of Object.entries(
		PROJECTION_EVENT_DEPENDENCIES,
	) as Array<[ProjectionId, string[]]>) {
		if (dependencies.some((dependency) => incoming.has(dependency))) {
			matched.push(projectionId);
		}
	}
	return matched;
}

export async function regenerateProjectionsForEventTypes(args: {
	bardoRoot: string;
	eventTypes: readonly string[];
	regenerateReports?: boolean;
}): Promise<
	Array<{
		projectionId: ProjectionId;
		projectionPath: string;
		eventCount: number;
	}>
> {
	const projectionIds = projectionIdsForEventTypes(args.eventTypes);
	const refreshed: Array<{
		projectionId: ProjectionId;
		projectionPath: string;
		eventCount: number;
	}> = [];

	for (const projectionId of projectionIds) {
		if (projectionId === "current_state") {
			const projection = await regenerateCurrentStateProjection({
				bardoRoot: args.bardoRoot,
				regenerateReports: args.regenerateReports,
			});
			refreshed.push({
				projectionId,
				projectionPath: projection.projectionPath,
				eventCount: projection.eventCount,
			});
		}
	}

	return refreshed;
}
