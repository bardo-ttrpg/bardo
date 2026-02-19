import { describe, expect, test } from "bun:test";
import {
	clerkDomainFromPublishableKey,
	doesClerkDomainMatchIssuer,
	isClerkAuthConfigured,
	isClerkIssuerDomainConfigured,
	isClerkPublishableKeyConfigured,
	isClerkSecretKeyConfigured,
} from "./clerk-config";

const VALID_PK = "pk_test_bXktYXBwLmNsZXJrLmFjY291bnRzLmRldiQ";
const VALID_SK = "sk_test_example_secret";
const VALID_ISSUER = "https://my-app.clerk.accounts.dev";

describe("clerk-config helpers", () => {
	test("validates publishable and secret key formats", () => {
		expect(isClerkPublishableKeyConfigured(VALID_PK)).toBe(true);
		expect(isClerkSecretKeyConfigured(VALID_SK)).toBe(true);
	});

	test("extracts clerk domain from publishable key", () => {
		expect(clerkDomainFromPublishableKey(VALID_PK)).toBe(
			"my-app.clerk.accounts.dev",
		);
	});

	test("requires a valid issuer domain", () => {
		expect(isClerkIssuerDomainConfigured(VALID_ISSUER)).toBe(true);
		expect(
			isClerkIssuerDomainConfigured("https://REPLACE_ME.clerk.accounts.dev"),
		).toBe(false);
	});

	test("checks publishable key/issuer coherence", () => {
		expect(
			doesClerkDomainMatchIssuer({
				publishableKey: VALID_PK,
				issuerDomain: VALID_ISSUER,
			}),
		).toBe(true);

		expect(
			doesClerkDomainMatchIssuer({
				publishableKey: VALID_PK,
				issuerDomain: "https://different.clerk.accounts.dev",
			}),
		).toBe(false);
	});

	test("requires issuer coherence for full auth readiness", () => {
		expect(
			isClerkAuthConfigured({
				publishableKey: VALID_PK,
				secretKey: VALID_SK,
				issuerDomain: VALID_ISSUER,
			}),
		).toBe(true);

		expect(
			isClerkAuthConfigured({
				publishableKey: VALID_PK,
				secretKey: VALID_SK,
				issuerDomain: undefined,
			}),
		).toBe(false);
	});
});
