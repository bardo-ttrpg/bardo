export type PlanTier = "free" | "pro";

export function normalizePlan(value: unknown): PlanTier | null {
	switch (typeof value === "string" ? value.trim().toLowerCase() : "") {
		case "free":
			return "free";
		case "pro":
		case "solo":
		case "solo_plus":
		case "solo-plus":
		case "soloplus":
			return "pro";
		default:
			return null;
	}
}
