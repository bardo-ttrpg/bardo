import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const signInSource = readFileSync(
	new URL("./(auth)/sign-in/[[...sign-in]]/page.tsx", import.meta.url),
	"utf8",
);
const signUpSource = readFileSync(
	new URL("./(auth)/sign-up/[[...sign-up]]/page.tsx", import.meta.url),
	"utf8",
);
const forgotPasswordSource = readFileSync(
	new URL("./(auth)/forgot-password/page.tsx", import.meta.url),
	"utf8",
);
const forgotPasswordFormSource = readFileSync(
	new URL("./(auth)/forgot-password/forgot-password-form.tsx", import.meta.url),
	"utf8",
);

describe("auth surface", () => {
	test("keeps sign-in and sign-up pages private and stripped down", () => {
		expect(signInSource).toContain("createPrivateMetadata");
		expect(signUpSource).toContain("createPrivateMetadata");
		expect(signInSource).toContain("<SignIn");
		expect(signUpSource).toContain("<SignUp");
		expect(signUpSource).not.toContain("/legal/terms");
	});

	test("adds a dedicated forgot-password route powered by Clerk custom auth", () => {
		expect(forgotPasswordSource).toContain("createPrivateMetadata");
		expect(forgotPasswordFormSource).toContain("useSignIn");
		expect(forgotPasswordFormSource).toContain("/sign-in");
	});
});
