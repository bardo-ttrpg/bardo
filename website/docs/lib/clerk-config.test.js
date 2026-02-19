import { describe, expect, test } from "bun:test";
import {
	isClerkAuthConfigured,
	isClerkPublishableKeyConfigured,
	isClerkSecretKeyConfigured,
} from "./clerk-config";

describe("isClerkPublishableKeyConfigured", () => {
	test("returns true for real Clerk publishable keys", () => {
		expect(
			isClerkPublishableKeyConfigured(
				"pk_test_aW52aXRpbmctdG9ydG9pc2UtMTAuY2xlcmsuYWNjb3VudHMuZGV2JA",
			),
		).toBe(true);
	});

	test("returns false for missing, placeholder, or template keys", () => {
		expect(isClerkPublishableKeyConfigured(undefined)).toBe(false);
		expect(isClerkPublishableKeyConfigured("pk_test_REPLACE_ME")).toBe(false);
		expect(isClerkPublishableKeyConfigured("pk_test_your_key_here")).toBe(
			false,
		);
		expect(isClerkPublishableKeyConfigured("")).toBe(false);
	});
});

describe("isClerkSecretKeyConfigured", () => {
	test("returns true for real Clerk secret keys", () => {
		expect(isClerkSecretKeyConfigured("sk_test_1234567890")).toBe(true);
		expect(isClerkSecretKeyConfigured("sk_live_1234567890")).toBe(true);
	});

	test("returns false for missing and placeholder secret keys", () => {
		expect(isClerkSecretKeyConfigured(undefined)).toBe(false);
		expect(isClerkSecretKeyConfigured("")).toBe(false);
		expect(isClerkSecretKeyConfigured("sk_test_REPLACE_ME")).toBe(false);
		expect(isClerkSecretKeyConfigured("sk_test_your_key_here")).toBe(false);
	});
});

describe("isClerkAuthConfigured", () => {
	test("returns true only when publishable and secret keys are configured", () => {
		expect(
			isClerkAuthConfigured({
				publishableKey:
					"pk_test_aW52aXRpbmctdG9ydG9pc2UtMTAuY2xlcmsuYWNjb3VudHMuZGV2JA",
				secretKey: "sk_test_1234567890",
			}),
		).toBe(true);
	});

	test("returns false when either publishable or secret key is missing", () => {
		expect(
			isClerkAuthConfigured({
				publishableKey:
					"pk_test_aW52aXRpbmctdG9ydG9pc2UtMTAuY2xlcmsuYWNjb3VudHMuZGV2JA",
				secretKey: undefined,
			}),
		).toBe(false);
		expect(
			isClerkAuthConfigured({
				publishableKey: undefined,
				secretKey: "sk_test_1234567890",
			}),
		).toBe(false);
	});
});
