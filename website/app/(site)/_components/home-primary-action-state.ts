export type HomePrimaryActionState = "dashboard" | "pending" | "sign_up";

export function resolveHomePrimaryActionState({
	clerkEnabled,
	isLoaded,
	isSignedIn,
}: {
	clerkEnabled: boolean;
	isLoaded: boolean;
	isSignedIn: boolean;
}): HomePrimaryActionState {
	if (!clerkEnabled) {
		return "sign_up";
	}

	if (!isLoaded) {
		return "pending";
	}

	return isSignedIn ? "dashboard" : "sign_up";
}
