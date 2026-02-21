import { describe, expect, test } from "bun:test";
import {
	authorizedPartyHostFromSessionToken,
	clerkDomainFromPublishableKey,
	doClerkKeysShareEnvironment,
	doesClerkDomainMatchIssuer,
	isClerkAuthConfigured,
	isClerkIssuerDomainConfigured,
	isClerkPublishableKeyConfigured,
	isClerkSecretKeyConfigured,
	issuerHostFromSessionToken,
	shouldResetClerkSessionForIssuer,
	shouldResetClerkSessionForRequest,
} from "./clerk-config";

const VALID_PK = "pk_test_bXktYXBwLmNsZXJrLmFjY291bnRzLmRldiQ";
const VALID_SK = "sk_test_example_secret";
const VALID_ISSUER = "https://my-app.clerk.accounts.dev";

function makeTestJwt(payload) {
	const header = Buffer.from(
		JSON.stringify({ alg: "none", typ: "JWT" }),
	).toString("base64url");
	const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
	return `${header}.${body}.`;
}

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

		expect(
			isClerkAuthConfigured({
				publishableKey: "pk_live_bXktYXBwLmNsZXJrLmFjY291bnRzLmRldiQ",
				secretKey: "sk_test_example_secret",
				issuerDomain: VALID_ISSUER,
			}),
		).toBe(false);
	});

	test("extracts issuer host from session token", () => {
		const token = makeTestJwt({
			iss: "https://my-app.clerk.accounts.dev",
		});
		expect(issuerHostFromSessionToken(token)).toBe("my-app.clerk.accounts.dev");
	});

	test("extracts authorized party host from session token", () => {
		const tokenWithUrl = makeTestJwt({
			azp: "http://localhost:3001",
		});
		expect(authorizedPartyHostFromSessionToken(tokenWithUrl)).toBe("localhost");

		const tokenWithHost = makeTestJwt({
			azp: "127.0.0.1",
		});
		expect(authorizedPartyHostFromSessionToken(tokenWithHost)).toBe(
			"127.0.0.1",
		);
	});

	test("detects stale session token issuer mismatch", () => {
		const staleToken = makeTestJwt({
			iss: "https://old-instance.clerk.accounts.dev",
		});

		expect(
			shouldResetClerkSessionForIssuer({
				sessionToken: staleToken,
				issuerDomain: VALID_ISSUER,
			}),
		).toBe(true);
	});

	test("keeps session when token issuer matches configured issuer", () => {
		const token = makeTestJwt({
			iss: VALID_ISSUER,
		});

		expect(
			shouldResetClerkSessionForIssuer({
				sessionToken: token,
				issuerDomain: VALID_ISSUER,
			}),
		).toBe(false);
	});

	test("keeps session when authorized party matches request host", () => {
		const token = makeTestJwt({
			iss: VALID_ISSUER,
			azp: "http://localhost:3001",
		});

		expect(
			shouldResetClerkSessionForRequest({
				sessionToken: token,
				issuerDomain: VALID_ISSUER,
				requestHostname: "localhost",
			}),
		).toBe(false);
	});

	test("keeps session for equivalent local host aliases", () => {
		const token = makeTestJwt({
			iss: VALID_ISSUER,
			azp: "127.0.0.1",
		});

		expect(
			shouldResetClerkSessionForRequest({
				sessionToken: token,
				issuerDomain: VALID_ISSUER,
				requestHostname: "localhost",
			}),
		).toBe(false);
	});

	test("resets session when authorized party mismatches request host", () => {
		const token = makeTestJwt({
			iss: VALID_ISSUER,
			azp: "https://example.com",
		});

		expect(
			shouldResetClerkSessionForRequest({
				sessionToken: token,
				issuerDomain: VALID_ISSUER,
				requestHostname: "localhost",
			}),
		).toBe(true);
	});

	test("resets session when issuer mismatches regardless of request host", () => {
		const token = makeTestJwt({
			iss: "https://old-instance.clerk.accounts.dev",
			azp: "http://localhost:3001",
		});

		expect(
			shouldResetClerkSessionForRequest({
				sessionToken: token,
				issuerDomain: VALID_ISSUER,
				requestHostname: "localhost",
			}),
		).toBe(true);
	});
});
