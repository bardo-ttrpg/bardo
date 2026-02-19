import { describe, expect, test } from "bun:test";
import { isClerkPublishableKeyConfigured } from "./clerk-config";

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
