import { describe, expect, test } from "bun:test";
import { resolveHomePrimaryActionState } from "./home-primary-action-state";

describe("resolveHomePrimaryActionState", () => {
	test("shows sign up when Clerk is disabled", () => {
		expect(
			resolveHomePrimaryActionState({
				clerkEnabled: false,
				isLoaded: false,
				isSignedIn: false,
			}),
		).toBe("sign_up");
	});

	test("holds a neutral pending state while Clerk loads", () => {
		expect(
			resolveHomePrimaryActionState({
				clerkEnabled: true,
				isLoaded: false,
				isSignedIn: false,
			}),
		).toBe("pending");
	});

	test("shows dashboard when the user is signed in", () => {
		expect(
			resolveHomePrimaryActionState({
				clerkEnabled: true,
				isLoaded: true,
				isSignedIn: true,
			}),
		).toBe("dashboard");
	});

	test("falls back to sign up when Clerk is loaded and no user is signed in", () => {
		expect(
			resolveHomePrimaryActionState({
				clerkEnabled: true,
				isLoaded: true,
				isSignedIn: false,
			}),
		).toBe("sign_up");
	});
});
