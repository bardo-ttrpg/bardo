import { makeToolResult } from "./tool-result";

export type PlanTier = "free" | "solo";

export const MIN_PLAN_ANNOTATION_KEY = "x-bardo-min-plan";

const PLAN_ORDER: Record<PlanTier, number> = {
	free: 0,
	solo: 1,
};

export function annotateWithMinPlan(
	minPlan: PlanTier,
	annotations: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		...annotations,
		[MIN_PLAN_ANNOTATION_KEY]: minPlan,
	};
}

export function hasRequiredPlan(
	plan: PlanTier | null | undefined,
	requiredPlan: PlanTier,
): boolean {
	if (!plan) {
		return false;
	}
	return PLAN_ORDER[plan] >= PLAN_ORDER[requiredPlan];
}

export function makePlanDeniedToolResult(requiredPlan: PlanTier) {
	return makeToolResult(
		{
			success: false,
			message: `This tool requires the ${requiredPlan} plan.`,
		},
		true,
	);
}
