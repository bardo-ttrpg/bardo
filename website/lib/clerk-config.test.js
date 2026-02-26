import { describe, expect, test } from "bun:test";
import {
	doClerkKeysShareEnvironment,
	isClerkAuthConfigured,
	isClerkPublishableKeyConfigured,
	isClerkSecretKeyConfigured,
} from "./clerk-config";

const VALID_PK = "pk_test_bXktYXBwLmNsZXJrLmFjY291bnRzLmRldiQ";
const VALID_SK = "sk_test_example_secret";

describe("clerk-config helpers", () => {
	test("validates publishable and secret key formats", () => {
		expect(isClerkPublishableKeyConfigured(VALID_PK)).toBe(true);
		expect(isClerkSecretKeyConfigured(VALID_SK)).toBe(true);
	});

	test("requires publishable and secret key environments to match", () => {
		expect(
			doClerkKeysShareEnvironment({
				publishableKey: "pk_test_bXktYXBwLmNsZXJrLmFjY291bnRzLmRldiQ",
				secretKey: "sk_test_example_secret",
			}),
		).toBe(true);

		expect(
			doClerkKeysShareEnvironment({
				publishableKey: "pk_live_bXktYXBwLmNsZXJrLmFjY291bnRzLmRldiQ",
				secretKey: "sk_test_example_secret",
			}),
		).toBe(false);
	});

	test("auth readiness only requires matching publishable/secret keys", () => {
		expect(
			isClerkAuthConfigured({
				publishableKey: VALID_PK,
				secretKey: VALID_SK,
			}),
		).toBe(true);

		expect(
			isClerkAuthConfigured({
				publishableKey: "pk_live_bXktYXBwLmNsZXJrLmFjY291bnRzLmRldiQ",
				secretKey: "sk_test_example_secret",
			}),
		).toBe(false);
	});
});
