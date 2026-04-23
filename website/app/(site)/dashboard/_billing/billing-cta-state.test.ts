import { describe, expect, test } from "bun:test";
import {
	resolveCheckoutPlanId,
	resolveCheckoutRenderState,
	resolveSubscriptionDetailsRenderState,
} from "./billing-cta-state";

describe("resolveCheckoutRenderState", () => {
	test("keeps the unavailable billing state stable before hydration", () => {
		expect(
			resolveCheckoutRenderState({
				isHydrated: false,
				isLoaded: false,
				isSignedIn: false,
				isUnavailable: true,
			}),
		).toBe("disabled_unavailable");
	});

	test("renders a sign-in CTA until hydration completes", () => {
		expect(
			resolveCheckoutRenderState({
				isHydrated: false,
				isLoaded: true,
				isSignedIn: true,
				isUnavailable: false,
			}),
		).toBe("sign_in");
	});

	test("renders checkout only after hydration with a signed-in user", () => {
		expect(
			resolveCheckoutRenderState({
				isHydrated: true,
				isLoaded: true,
				isSignedIn: true,
				isUnavailable: false,
			}),
		).toBe("checkout");
	});
});

describe("resolveCheckoutPlanId", () => {
	test("prefers an explicitly configured Clerk plan id", () => {
		expect(
			resolveCheckoutPlanId({
				configuredPlanId: " cplan_configured ",
				plans: [{ id: "cplan_public", slug: "pro" }],
			}),
		).toBe("cplan_configured");
	});

	test("resolves the public Clerk Pro plan by slug when env config is absent", () => {
		expect(
			resolveCheckoutPlanId({
				configuredPlanId: null,
				plans: [
					{ id: "cplan_free", slug: "free", isDefault: true },
					{ id: "cplan_pro", slug: "pro", isDefault: false },
				],
			}),
		).toBe("cplan_pro");
	});

	test("does not use Clerk's default free plan as the checkout plan", () => {
		expect(
			resolveCheckoutPlanId({
				configuredPlanId: null,
				plans: [{ id: "cplan_free", slug: "free", isDefault: true }],
			}),
		).toBeNull();
	});
});

describe("resolveSubscriptionDetailsRenderState", () => {
	test("renders sign-in until hydration completes", () => {
		expect(
			resolveSubscriptionDetailsRenderState({
				isHydrated: false,
				isLoaded: true,
				isSignedIn: true,
			}),
		).toBe("sign_in");
	});

	test("renders manage billing after hydration for signed-in users", () => {
		expect(
			resolveSubscriptionDetailsRenderState({
				isHydrated: true,
				isLoaded: true,
				isSignedIn: true,
			}),
		).toBe("manage");
	});
});
