import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const signInSource = readFileSync(
	new URL("./(auth)/sign-in/[[...sign-in]]/page.tsx", import.meta.url),
	"utf8",
);
const signUpSource = readFileSync(
	new URL("./(auth)/sign-up/[[...sign-up]]/page.tsx", import.meta.url),
	"utf8",
);

describe("auth surface", () => {
	test("keeps sign-in and sign-up pages private and stripped down", () => {
		expect(signInSource).toContain("createPrivateMetadata");
		expect(signUpSource).toContain("createPrivateMetadata");
		expect(signInSource).toContain("<SignIn");
		expect(signUpSource).toContain("<SignUp");
		expect(signUpSource).not.toContain("/legal/terms");
		expect(signInSource).not.toContain("/forgot-password");
		expect(signInSource).toContain('variant="fade"');
		expect(signUpSource).toContain('variant="fade"');
	});

	test("does not keep a separate forgot-password route in the public app surface", () => {
		expect(
			existsSync(new URL("./(auth)/forgot-password/page.tsx", import.meta.url)),
		).toBe(false);
		expect(
			existsSync(
				new URL("./(auth)/forgot-password/forgot-password-form.tsx", import.meta.url),
			),
		).toBe(false);
	});
});
