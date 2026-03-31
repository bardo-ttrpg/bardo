import { describe, expect, test } from "bun:test";
import { resolveBillingClerkConfig } from "./billing-clerk-config";

describe("resolveBillingClerkConfig", () => {
	test("derives Clerk-enabled state and plan ids on the server", () => {
		expect(
			resolveBillingClerkConfig({
				publishableKey: "pk_test_123",
				secretKey: "sk_test_123",
				env: {
					CLERK_BILLING_PLAN_SOLO: "cplan_solo",
				},
			}),
		).toEqual({
			clerkEnabled: true,
			clerkPlanIds: {
				solo: "cplan_solo",
			},
		});
	});

	test("keeps missing billing plan ids explicit", () => {
		expect(
			resolveBillingClerkConfig({
				publishableKey: "pk_test_123",
				secretKey: "sk_test_123",
				env: {},
			}),
		).toEqual({
			clerkEnabled: true,
			clerkPlanIds: {
				solo: null,
			},
		});
	});
});
