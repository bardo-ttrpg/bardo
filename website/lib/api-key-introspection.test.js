import { describe, expect, test } from "bun:test";
import { createIntrospectionSecretValidator } from "./api-key-introspection";

describe("createIntrospectionSecretValidator", () => {
	test("accepts correct bearer secret", () => {
		const isAuthorized = createIntrospectionSecretValidator("secret");
		expect(isAuthorized(new Headers({ authorization: "Bearer secret" }))).toBe(
			true,
		);
	});

	test("rejects missing authorization header", () => {
		const isAuthorized = createIntrospectionSecretValidator("secret");
		expect(isAuthorized(new Headers())).toBe(false);
	});

	test("rejects wrong secret", () => {
		const isAuthorized = createIntrospectionSecretValidator("secret");
		expect(isAuthorized(new Headers({ authorization: "Bearer wrong" }))).toBe(
			false,
		);
	});

	test("rejects when validator secret is empty", () => {
		const isAuthorized = createIntrospectionSecretValidator("");
		expect(
			isAuthorized(new Headers({ authorization: "Bearer anything" })),
		).toBe(false);
	});

	test("rejects undefined validator secret", () => {
		const isAuthorized = createIntrospectionSecretValidator(undefined);
		expect(
			isAuthorized(new Headers({ authorization: "Bearer anything" })),
		).toBe(false);
	});
});
