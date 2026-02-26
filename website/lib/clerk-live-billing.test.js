import { describe, expect, test } from "bun:test";
import {
	fetchLiveBillingSnapshotFromClerk,
	resolveLiveBillingSnapshotFromSubscription,
} from "./clerk-live-billing";

describe("clerk-live-billing", () => {
	test("falls back to free plan when user has no subscription", () => {
		const now = 1_700_000_000_000;
		const snapshot = resolveLiveBillingSnapshotFromSubscription(null, {}, now);

		expect(snapshot.plan).toBe("free");
		expect(snapshot.billingInterval).toBeNull();
		expect(snapshot.subscriptionId).toBeNull();
		expect(snapshot.subscriptionStatus).toBe("canceled");
		expect(snapshot.periodStart).toBe(now);
		expect(snapshot.currentPeriodEnd).toBeNull();
		expect(snapshot.cancelAtPeriodEnd).toBe(false);
	});

	test("maps Clerk plan id to solo_plus and annual interval", () => {
		const snapshot = resolveLiveBillingSnapshotFromSubscription(
			{
				id: "sub_123",
				status: "active",
				subscriptionItems: [
					{
						status: "active",
						planId: "cplan_solo_plus",
						planPeriod: "annual",
						periodStart: 100,
						periodEnd: 200,
						canceledAt: null,
					},
				],
			},
			{
				CLERK_BILLING_PLAN_SOLO: "cplan_solo",
				CLERK_BILLING_PLAN_SOLO_PLUS: "cplan_solo_plus",
			},
			150,
		);

		expect(snapshot.plan).toBe("solo_plus");
		expect(snapshot.billingInterval).toBe("year");
		expect(snapshot.subscriptionStatus).toBe("active");
		expect(snapshot.subscriptionId).toBe("sub_123");
		expect(snapshot.periodStart).toBe(100);
		expect(snapshot.currentPeriodEnd).toBe(200);
		expect(snapshot.cancelAtPeriodEnd).toBe(false);
	});

	test("fetchLiveBillingSnapshotFromClerk sets billingUnavailable on clerk error", async () => {
		const fakeClerk = {
			billing: {
				getUserBillingSubscription: async () => {
					throw new Error("network failure");
				},
			},
		};
		const snapshot = await fetchLiveBillingSnapshotFromClerk(fakeClerk, "user_123", {});
		expect(snapshot.billingUnavailable).toBe(true);
		expect(snapshot.plan).toBe("free");
	});

	test("fetchLiveBillingSnapshotFromClerk sets billingUnavailable false on success", async () => {
		const fakeClerk = {
			billing: {
				getUserBillingSubscription: async () => ({
					id: "sub_ok",
					status: "active",
					subscriptionItems: [],
				}),
			},
		};
		const snapshot = await fetchLiveBillingSnapshotFromClerk(fakeClerk, "user_123", {});
		expect(snapshot.billingUnavailable).toBe(false);
	});

	test("marks cancel_at_period_end when canceled_at exists before period end", () => {
		const snapshot = resolveLiveBillingSnapshotFromSubscription(
			{
				id: "sub_123",
				status: "active",
				subscriptionItems: [
					{
						status: "active",
						planId: "cplan_solo",
						planPeriod: "month",
						periodStart: 100,
						periodEnd: 300,
						canceledAt: 150,
					},
				],
			},
			{
				CLERK_BILLING_PLAN_SOLO: "cplan_solo",
				CLERK_BILLING_PLAN_SOLO_PLUS: "cplan_solo_plus",
			},
			200,
		);

		expect(snapshot.plan).toBe("solo");
		expect(snapshot.billingInterval).toBe("month");
		expect(snapshot.cancelAtPeriodEnd).toBe(true);
	});
});
