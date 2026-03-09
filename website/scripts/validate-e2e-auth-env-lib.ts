type E2EAuthEnvValidationResult = {
	email: string | null;
	password: string | null;
	phoneNumber: string | null;
	verificationCode: string | null;
	strategy: "password" | "email_code" | "phone_code" | null;
	errors: string[];
	warnings: string[];
};

function normalize(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function requirePrefix(
	value: string | null,
	prefix: string,
	label: string,
	errors: string[],
) {
	if (!value) {
		errors.push(`${label} is missing`);
		return;
	}

	if (!value.startsWith(prefix)) {
		errors.push(`${label} must start with ${prefix} for Clerk Playwright runs`);
	}
}

export function validateE2EAuthEnv(
	env: Record<string, string | undefined>,
): E2EAuthEnvValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	requirePrefix(
		normalize(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
		"pk_test_",
		"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
		errors,
	);
	requirePrefix(
		normalize(env.CLERK_SECRET_KEY),
		"sk_test_",
		"CLERK_SECRET_KEY",
		errors,
	);

	const email =
		normalize(env.E2E_CLERK_EMAIL) ?? normalize(env.E2E_CLERK_USER_IDENTIFIER);
	if (email && !normalize(env.E2E_CLERK_EMAIL)) {
		warnings.push(
			"E2E_CLERK_USER_IDENTIFIER is deprecated; prefer E2E_CLERK_EMAIL.",
		);
	}

	const password = normalize(env.E2E_CLERK_PASSWORD);
	const phoneNumber = normalize(env.E2E_CLERK_TEST_PHONE_NUMBER);
	const verificationCode =
		normalize(env.E2E_CLERK_TEST_VERIFICATION_CODE) ??
		normalize(env.E2E_CLERK_EMAIL_CODE);

	if (
		!normalize(env.E2E_CLERK_TEST_VERIFICATION_CODE) &&
		normalize(env.E2E_CLERK_EMAIL_CODE)
	) {
		warnings.push(
			"E2E_CLERK_EMAIL_CODE is deprecated; prefer E2E_CLERK_TEST_VERIFICATION_CODE.",
		);
	}

	let strategy: E2EAuthEnvValidationResult["strategy"] = null;

	if (email && password) {
		strategy = "password";
	} else if (email) {
		if (!email.includes("+clerk_test")) {
			errors.push(
				"E2E_CLERK_EMAIL must include +clerk_test when E2E_CLERK_PASSWORD is not set.",
			);
		} else {
			strategy = "email_code";
		}
	} else if (phoneNumber) {
		strategy = "phone_code";
	}

	if (!strategy) {
		errors.push(
			"Provide either E2E_CLERK_EMAIL + E2E_CLERK_PASSWORD, a +clerk_test E2E_CLERK_EMAIL, or E2E_CLERK_TEST_PHONE_NUMBER.",
		);
	}

	if (
		strategy === "phone_code" &&
		!/^\+1\d{3}55501\d{2}$/u.test(phoneNumber ?? "")
	) {
		errors.push(
			"E2E_CLERK_TEST_PHONE_NUMBER must be a Clerk test phone number like +15555550100.",
		);
	}

	if (verificationCode && verificationCode !== "424242") {
		errors.push(
			"E2E_CLERK_TEST_VERIFICATION_CODE must be 424242 for Clerk test identities.",
		);
	}

	return {
		email,
		password,
		phoneNumber,
		verificationCode,
		strategy,
		errors,
		warnings,
	};
}
