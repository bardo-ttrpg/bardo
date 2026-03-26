import { describe, expect, test } from "bun:test";
import {
	clerkPlanPeriodFromBillingInterval,
	getClerkPlanId,
	isClerkBillingConfigured,
} from "./clerk-billing";

describe("clerk-billing", () => {
	test("maps internal billing interval to Clerk plan period", () => {
		expect(clerkPlanPeriodFromBillingInterval("month")).toBe("month");
		expect(clerkPlanPeriodFromBillingInterval("year")).toBe("annual");
	});

	test("resolves plan ids from env keys", () => {
		const env = {
			CLERK_BILLING_PLAN_SOLO: "cplan_solo",
		};

		expect(getClerkPlanId("solo", env)).toBe("cplan_solo");
	});

	test("returns null when plan id is missing", () => {
		expect(getClerkPlanId("solo", {})).toBeNull();
	});

	test("billing is configured only when all plan ids exist", () => {
		expect(
			isClerkBillingConfigured({
				CLERK_BILLING_PLAN_SOLO: "cplan_solo",
			}),
		).toBe(true);

		expect(
			isClerkBillingConfigured({
				CLERK_BILLING_PLAN_SOLO: "cplan_solo",
			}),
		).toBe(true);
	});
});
