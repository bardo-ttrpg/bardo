import { describe, expect, test } from "bun:test";
import { validateE2EAuthEnv } from "./validate-e2e-auth-env-lib";

describe("validateE2EAuthEnv", () => {
	test("requires test Clerk keys and at least one supported Clerk auth strategy", () => {
		const result = validateE2EAuthEnv({});

		expect(result.errors).toEqual([
			"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing",
			"CLERK_SECRET_KEY is missing",
			"Provide either E2E_CLERK_EMAIL + E2E_CLERK_PASSWORD, a +clerk_test E2E_CLERK_EMAIL, or E2E_CLERK_TEST_PHONE_NUMBER.",
		]);
		expect(result.warnings).toEqual([]);
		expect(result.verificationCode).toBeNull();
		expect(result.strategy).toBeNull();
	});

	test("accepts password-based seeded credentials", () => {
		const result = validateE2EAuthEnv({
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			CLERK_SECRET_KEY: "sk_test_123",
			E2E_CLERK_EMAIL: "tester@example.com",
			E2E_CLERK_PASSWORD: "super-secret",
		});

		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
		expect(result.email).toBe("tester@example.com");
		expect(result.password).toBe("super-secret");
		expect(result.verificationCode).toBeNull();
		expect(result.strategy).toBe("password");
	});

	test("falls back to the legacy identifier with a warning", () => {
		const result = validateE2EAuthEnv({
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			CLERK_SECRET_KEY: "sk_test_123",
			E2E_CLERK_USER_IDENTIFIER: "legacy@example.com",
			E2E_CLERK_PASSWORD: "super-secret",
		});

		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([
			"E2E_CLERK_USER_IDENTIFIER is deprecated; prefer E2E_CLERK_EMAIL.",
		]);
		expect(result.email).toBe("legacy@example.com");
		expect(result.verificationCode).toBeNull();
		expect(result.strategy).toBe("password");
	});

	test("rejects live Clerk keys for Playwright auth runs", () => {
		const result = validateE2EAuthEnv({
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			CLERK_SECRET_KEY: "sk_live_123",
			E2E_CLERK_EMAIL: "tester@example.com",
			E2E_CLERK_PASSWORD: "super-secret",
		});

		expect(result.errors).toEqual([
			"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must start with pk_test_ for Clerk Playwright runs",
			"CLERK_SECRET_KEY must start with sk_test_ for Clerk Playwright runs",
		]);
	});

	test("accepts a +clerk_test email without a password", () => {
		const result = validateE2EAuthEnv({
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			CLERK_SECRET_KEY: "sk_test_123",
			E2E_CLERK_EMAIL: "tester+clerk_test@example.com",
			E2E_CLERK_TEST_VERIFICATION_CODE: "424242",
		});

		expect(result.errors).toEqual([]);
		expect(result.verificationCode).toBe("424242");
		expect(result.strategy).toBe("email_code");
	});

	test("accepts a Clerk test phone number without email credentials", () => {
		const result = validateE2EAuthEnv({
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			CLERK_SECRET_KEY: "sk_test_123",
			E2E_CLERK_TEST_PHONE_NUMBER: "+15555550100",
		});

		expect(result.errors).toEqual([]);
		expect(result.phoneNumber).toBe("+15555550100");
		expect(result.strategy).toBe("phone_code");
	});

	test("rejects a non-test email without a password", () => {
		const result = validateE2EAuthEnv({
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			CLERK_SECRET_KEY: "sk_test_123",
			E2E_CLERK_EMAIL: "tester@example.com",
		});

		expect(result.errors).toEqual([
			"E2E_CLERK_EMAIL must include +clerk_test when E2E_CLERK_PASSWORD is not set.",
			"Provide either E2E_CLERK_EMAIL + E2E_CLERK_PASSWORD, a +clerk_test E2E_CLERK_EMAIL, or E2E_CLERK_TEST_PHONE_NUMBER.",
		]);
	});

	test("rejects non-424242 test verification codes", () => {
		const result = validateE2EAuthEnv({
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			CLERK_SECRET_KEY: "sk_test_123",
			E2E_CLERK_EMAIL: "tester+clerk_test@example.com",
			E2E_CLERK_TEST_VERIFICATION_CODE: "123456",
		});

		expect(result.errors).toEqual([
			"E2E_CLERK_TEST_VERIFICATION_CODE must be 424242 for Clerk test identities.",
		]);
	});
});
