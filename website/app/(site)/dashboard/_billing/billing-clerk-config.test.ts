import { describe, expect, test } from "bun:test";
import { resolveBillingClerkConfig } from "./billing-clerk-config";

describe("resolveBillingClerkConfig", () => {
	test("derives Clerk-enabled state and plan ids on the server", () => {
		expect(
			resolveBillingClerkConfig({
				publishableKey: "pk_test_123",
				secretKey: "sk_test_123",
				env: {
					CLERK_BILLING_PLAN_PRO: "cplan_pro",
				},
			}),
		).toEqual({
			clerkEnabled: true,
			clerkPlanIds: {
				pro: "cplan_pro",
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
				pro: null,
			},
		});
	});
});
