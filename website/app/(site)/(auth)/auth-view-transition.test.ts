import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const signInSource = readFileSync(
	new URL("./sign-in/[[...sign-in]]/page.tsx", import.meta.url),
	"utf8",
);
const signUpSource = readFileSync(
	new URL("./sign-up/[[...sign-up]]/page.tsx", import.meta.url),
	"utf8",
);

describe("auth view transitions", () => {
	test("uses fade transitions on the auth entry pages", () => {
		expect(signInSource).toContain('variant="fade"');
		expect(signUpSource).toContain('variant="fade"');
	});
});
