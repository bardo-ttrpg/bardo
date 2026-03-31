import { describe, expect, test } from "bun:test";
import {
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
