function deepEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export function evaluateTurnInvariants(args: {
	actionSuccess: boolean;
	previousEventCount: number;
	currentEventCount: number;
	projectionState: unknown;
	derivedState: unknown;
}): {
	success: boolean;
	eventGrowthOk: boolean;
	projectionConsistent: boolean;
	failures: {
		actionFailed: boolean;
		eventGrowthViolation: boolean;
		projectionDrift: boolean;
	};
} {
	const eventGrowthOk = args.currentEventCount > args.previousEventCount;
	const projectionConsistent = deepEqual(
		args.projectionState,
		args.derivedState,
	);
	const actionFailed = !args.actionSuccess;
	const eventGrowthViolation = !eventGrowthOk;
	const projectionDrift = !projectionConsistent;

	return {
		success: args.actionSuccess && eventGrowthOk && projectionConsistent,
		eventGrowthOk,
		projectionConsistent,
		failures: {
			actionFailed,
			eventGrowthViolation,
			projectionDrift,
		},
	};
}

export function evaluateReplayInvariants(args: {
	eventCountBeforeReplay: number;
	eventCountAfterReplay: number;
	projectionBeforeReplay: unknown;
	projectionAfterReplay: unknown;
}): {
	stable: boolean;
	replayStable: boolean;
	projectionStable: boolean;
	failures: {
		replayEventDrift: boolean;
		replayProjectionDrift: boolean;
	};
} {
	const replayStable =
		args.eventCountBeforeReplay === args.eventCountAfterReplay;
	const projectionStable = deepEqual(
		args.projectionBeforeReplay,
		args.projectionAfterReplay,
	);
	return {
		stable: replayStable && projectionStable,
		replayStable,
		projectionStable,
		failures: {
			replayEventDrift: !replayStable,
			replayProjectionDrift: !projectionStable,
		},
	};
}
