export type PlanTier = "free" | "solo" | "solo_plus";

export function normalizePlan(value: unknown): PlanTier | null {
	switch (typeof value === "string" ? value.trim().toLowerCase() : "") {
		case "free":
			return "free";
		case "solo":
			return "solo";
		case "solo_plus":
		case "solo-plus":
		case "soloplus":
			return "solo_plus";
		default:
			return null;
	}
}
