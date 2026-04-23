type CheckoutRenderState = "checkout" | "disabled_unavailable" | "sign_in";

type CheckoutPlanLike = {
	id?: string | null;
	slug?: string | null;
	name?: string | null;
	isDefault?: boolean | null;
};

function normalizePlanToken(value: string | null | undefined): string {
	return value?.trim().toLowerCase() ?? "";
}

export function resolveCheckoutPlanId({
	configuredPlanId,
	plans,
	planSlug = "pro",
}: {
	configuredPlanId?: string | null;
	plans?: CheckoutPlanLike[] | null;
	planSlug?: string;
}): string | null {
	const configured = configuredPlanId?.trim();
	if (configured) return configured;

	const normalizedSlug = normalizePlanToken(planSlug);
	const plan = plans?.find((candidate) => {
		if (!candidate.id?.trim()) return false;
		if (normalizePlanToken(candidate.slug) === normalizedSlug) return true;
		return (
			!candidate.isDefault &&
			normalizePlanToken(candidate.name) === normalizedSlug
		);
	});

	return plan?.id?.trim() ?? null;
}

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

type SubscriptionDetailsRenderState = "manage" | "sign_in";

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
