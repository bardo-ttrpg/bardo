export type CheckoutRenderState =
	| "checkout"
	| "disabled_unavailable"
	| "sign_in";

export function resolveCheckoutRenderState({
	isHydrated,
	isLoaded,
	isSignedIn,
	isUnavailable,
}: {
	isHydrated: boolean;
	isLoaded: boolean;
	isSignedIn: boolean;
	isUnavailable: boolean;
}): CheckoutRenderState {
	if (isUnavailable) {
		return "disabled_unavailable";
	}

	if (!isHydrated) {
		return "sign_in";
	}

	return isLoaded && isSignedIn ? "checkout" : "sign_in";
}

export type SubscriptionDetailsRenderState = "manage" | "sign_in";

export function resolveSubscriptionDetailsRenderState({
	isHydrated,
	isLoaded,
	isSignedIn,
}: {
	isHydrated: boolean;
	isLoaded: boolean;
	isSignedIn: boolean;
}): SubscriptionDetailsRenderState {
	if (!isHydrated) {
		return "sign_in";
	}

	return isLoaded && isSignedIn ? "manage" : "sign_in";
}
