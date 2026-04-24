import { describe, expect, test } from "bun:test";
import {
	createClerkBillingReader,
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

	test("maps Clerk plan id to pro and annual interval", () => {
		const snapshot = resolveLiveBillingSnapshotFromSubscription(
			{
				id: "sub_123",
				status: "active",
				subscriptionItems: [
					{
						status: "active",
						planId: "cplan_pro",
						planPeriod: "annual",
						periodStart: 100,
						periodEnd: 200,
						canceledAt: null,
					},
				],
			},
			{
				CLERK_BILLING_PLAN_PRO: "cplan_pro",
			},
			150,
		);

		expect(snapshot.plan).toBe("pro");
		expect(snapshot.billingInterval).toBe("year");
		expect(snapshot.subscriptionStatus).toBe("active");
		expect(snapshot.subscriptionId).toBe("sub_123");
		expect(snapshot.periodStart).toBe(100);
		expect(snapshot.currentPeriodEnd).toBe(200);
		expect(snapshot.cancelAtPeriodEnd).toBe(false);
	});

	test("maps legacy solo Clerk plan id to pro", () => {
		const snapshot = resolveLiveBillingSnapshotFromSubscription(
			{
				id: "sub_legacy_solo",
				status: "active",
				subscriptionItems: [
					{
						status: "active",
						planId: "cplan_solo",
						planPeriod: "month",
						periodStart: 100,
						periodEnd: 200,
						canceledAt: null,
					},
				],
			},
			{
				CLERK_BILLING_PLAN_SOLO: "cplan_solo",
			},
			150,
		);

		expect(snapshot.plan).toBe("pro");
		expect(snapshot.billingInterval).toBe("month");
		expect(snapshot.subscriptionStatus).toBe("active");
	});

	test("maps the current Clerk subscription item plan slug to pro without env configuration", () => {
		const periodStart = new Date("2026-04-01T00:00:00.000Z");
		const periodEnd = new Date("2026-05-01T00:00:00.000Z");
		const snapshot = resolveLiveBillingSnapshotFromSubscription(
			{
				id: "sub_current",
				status: "active",
				subscriptionItems: [
					{
						status: "active",
						plan: {
							id: "cplan_runtime_pro",
							slug: "pro",
							name: "Pro",
							isDefault: false,
						},
						planPeriod: "annual",
						periodStart,
						periodEnd,
						canceledAt: null,
					},
				],
			},
			{},
			periodStart.getTime(),
		);

		expect(snapshot.plan).toBe("pro");
		expect(snapshot.billingInterval).toBe("year");
		expect(snapshot.subscriptionStatus).toBe("active");
		expect(snapshot.periodStart).toBe(periodStart.getTime());
		expect(snapshot.currentPeriodEnd).toBe(periodEnd.getTime());
	});

	test("treats an active free default item as hidden fallback without MCP value", () => {
		const snapshot = resolveLiveBillingSnapshotFromSubscription(
			{
				id: "sub_free",
				status: "active",
				subscriptionItems: [
					{
						status: "active",
						plan: {
							id: "cplan_free",
							slug: "free",
							name: "Free",
							isDefault: true,
						},
						planPeriod: "month",
						periodStart: 100,
						periodEnd: 200,
					},
				],
			},
			{},
			150,
		);

		expect(snapshot.plan).toBe("free");
		expect(snapshot.billingInterval).toBeNull();
		expect(snapshot.subscriptionStatus).toBe("canceled");
	});

	test("does not grant pro access for ended pro items even when Clerk keeps the free subscription active", () => {
		const snapshot = resolveLiveBillingSnapshotFromSubscription(
			{
				id: "sub_downgraded",
				status: "active",
				subscriptionItems: [
					{
						status: "active",
						plan: {
							id: "cplan_free",
							slug: "free",
							name: "Free",
							isDefault: true,
						},
						planPeriod: "month",
					},
					{
						status: "ended",
						plan: {
							id: "cplan_pro",
							slug: "pro",
							name: "Pro",
							isDefault: false,
						},
						planPeriod: "month",
						periodStart: 100,
						periodEnd: 200,
						canceledAt: 150,
					},
				],
			},
			{},
			300,
		);

		expect(snapshot.plan).toBe("free");
		expect(snapshot.billingInterval).toBeNull();
		expect(snapshot.subscriptionStatus).toBe("canceled");
	});

	test("treats active Clerk free trials on the pro plan as paid-equivalent access", () => {
		const snapshot = resolveLiveBillingSnapshotFromSubscription(
			{
				id: "sub_trial",
				status: "active",
				subscriptionItems: [
					{
						status: "active",
						plan: {
							id: "cplan_pro",
							slug: "pro",
							name: "Pro",
							isDefault: false,
						},
						planPeriod: "month",
						periodStart: 100,
						periodEnd: 200,
						canceledAt: null,
						isFreeTrial: true,
					},
				],
			},
			{},
			150,
		);

		expect(snapshot.plan).toBe("pro");
		expect(snapshot.subscriptionStatus).toBe("trialing");
		expect(snapshot.billingInterval).toBe("month");
	});

	test("fetchLiveBillingSnapshotFromClerk sets billingUnavailable on clerk error", async () => {
		const fakeClerk = {
			billing: {
				getUserBillingSubscription: async () => {
					throw new Error("network failure");
				},
			},
		};
		const snapshot = await fetchLiveBillingSnapshotFromClerk(
			fakeClerk,
			"user_123",
			{},
		);
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
		const snapshot = await fetchLiveBillingSnapshotFromClerk(
			fakeClerk,
			"user_123",
			{},
		);
		expect(snapshot.billingUnavailable).toBe(false);
	});

	test("creates a billing reader that preserves the Clerk billing method binding", async () => {
		const billing = {
			prefix: "bound",
			async getUserBillingSubscription(userId) {
				return {
					id: `${this.prefix}:${userId}`,
					status: "active",
					subscriptionItems: [],
				};
			},
		};

		const reader = createClerkBillingReader({ billing });
		expect(typeof reader).toBe("function");

		const subscription = await reader?.("user_123");
		expect(subscription?.id).toBe("bound:user_123");
	});

	test("marks cancel_at_period_end when canceled_at exists before period end", () => {
		const snapshot = resolveLiveBillingSnapshotFromSubscription(
			{
				id: "sub_123",
				status: "active",
				subscriptionItems: [
					{
						status: "active",
						planId: "cplan_pro",
						planPeriod: "month",
						periodStart: 100,
						periodEnd: 300,
						canceledAt: 150,
					},
				],
			},
			{
				CLERK_BILLING_PLAN_PRO: "cplan_pro",
			},
			200,
		);

		expect(snapshot.plan).toBe("pro");
		expect(snapshot.billingInterval).toBe("month");
		expect(snapshot.cancelAtPeriodEnd).toBe(true);
	});
});
