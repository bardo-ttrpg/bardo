import { describe, expect, test } from "bun:test";
import {
	annotateWithMinPlan,
	hasRequiredPlan,
	MIN_PLAN_ANNOTATION_KEY,
	type PlanTier,
} from "./tool-plan";

describe("tool plan contract", () => {
	test("adds a canonical min-plan annotation without losing existing annotations", () => {
		const annotated = annotateWithMinPlan("solo", {
			readOnlyHint: true,
			title: "Example",
		});

		expect(annotated.readOnlyHint).toBe(true);
		expect(annotated[MIN_PLAN_ANNOTATION_KEY]).toBe("solo");
	});

	test.each([
		["free", "free", true],
		["solo", "free", true],
		["solo", "solo", true],
		["solo", "solo_plus", false],
		["solo_plus", "solo", true],
		[null, "solo", false],
	] satisfies Array<
		[PlanTier | null, PlanTier, boolean]
	>)("hasRequiredPlan(%p, %p) => %p", (plan, required, expected) => {
		expect(hasRequiredPlan(plan, required)).toBe(expected);
	});
});
