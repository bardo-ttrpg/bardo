export type PolicyCoverageStatus = "guarded" | "exempt" | "profile_blocked";

export type PolicyCoverageEntry = {
	pathId: string;
	kind: "tool" | "route";
	status: PolicyCoverageStatus;
	rationale: string;
};

// Canon-affecting paths and their policy posture.
// This inventory is intentionally explicit so CI can fail if coverage drifts.
export const POLICY_COVERAGE: readonly PolicyCoverageEntry[] = [
	{
		pathId: "player_action",
		kind: "tool",
		status: "guarded",
		rationale:
			"Evaluates table-contract/authority policy and emits runtime_policy_blocked on violations.",
	},
	{
		pathId: "world_sync",
		kind: "tool",
		status: "guarded",
		rationale:
			"Evaluates transcript content against table-contract/authority policy before canonical mutation.",
	},
	{
		pathId: "simulation_tick",
		kind: "tool",
		status: "guarded",
		rationale:
			"Evaluates autonomous progression intent against policy before canonical mutation.",
	},
	{
		pathId: "append_event",
		kind: "tool",
		status: "guarded",
		rationale:
			"Evaluates event text/action context against policy before appending canonical events.",
	},
	{
		pathId: "apply_domain_transition",
		kind: "tool",
		status: "guarded",
		rationale:
			"Evaluates transition reason against policy before appending canonical domain transitions.",
	},
	{
		pathId: "roll_dice",
		kind: "tool",
		status: "exempt",
		rationale:
			"Deterministic mechanics primitive without freeform narrative/world-fact assertions.",
	},
	{
		pathId: "resolve_mechanics",
		kind: "tool",
		status: "exempt",
		rationale:
			"Deterministic rules resolution primitive; no narrative fact introduction.",
	},
	{
		pathId: "migrate_legacy_state",
		kind: "tool",
		status: "profile_blocked",
		rationale:
			"Administrative migration path; excluded from gameplay profile and intended for controlled ops runs.",
	},
] as const;
