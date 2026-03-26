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
		pathId: "scene_turn",
		kind: "tool",
		status: "guarded",
		rationale:
			"Primary public GM tool. It can advance canon-backed state and must stay inside runtime guardrails.",
	},
	{
		pathId: "context_query",
		kind: "tool",
		status: "exempt",
		rationale:
			"Read-only retrieval tool; it shapes decisions but does not mutate canon.",
	},
	{
		pathId: "world_state_overview",
		kind: "tool",
		status: "exempt",
		rationale:
			"Derived report refresh. It summarizes current canon without introducing new facts on its own.",
	},
	{
		pathId: "continuity_audit",
		kind: "tool",
		status: "exempt",
		rationale:
			"Derived audit report. It highlights drift and contradictions but does not create canon directly.",
	},
	{
		pathId: "timeline_diff",
		kind: "tool",
		status: "exempt",
		rationale:
			"Derived change report. It reads canonical history and emits a summary only.",
	},
	{
		pathId: "player_knowledge_view",
		kind: "tool",
		status: "exempt",
		rationale:
			"Player-safe derived report. It is read-only and should not be policy-blocked as a mutation path.",
	},
] as const;
