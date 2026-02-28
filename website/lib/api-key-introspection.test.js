import { describe, expect, test } from "bun:test";
import {
	createIntrospectionSecretValidator,
	resolveRequestedWorkspaceRoot,
} from "./api-key-introspection";

describe("createIntrospectionSecretValidator", () => {
	test("accepts dedicated x-bardo-introspection-token header", () => {
		const isAuthorized = createIntrospectionSecretValidator("secret");
		expect(
			isAuthorized(new Headers({ "x-bardo-introspection-token": "secret" })),
		).toBe(true);
	});

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

describe("resolveRequestedWorkspaceRoot", () => {
	test("returns null when override is disabled", () => {
		const result = resolveRequestedWorkspaceRoot({
			rawWorkspaceRoot: "/home/armando/projects/bardo-testing",
			allowOverrideEnv: "false",
		});
		expect(result).toBeNull();
	});

	test("returns absolute workspace root when override is enabled", () => {
		const result = resolveRequestedWorkspaceRoot({
			rawWorkspaceRoot: "/home/armando/projects/bardo-testing",
			allowOverrideEnv: "true",
		});
		expect(result).toBe("/home/armando/projects/bardo-testing");
	});

	test("rejects non-absolute workspace root", () => {
		const result = resolveRequestedWorkspaceRoot({
			rawWorkspaceRoot: "./bardo-testing",
			allowOverrideEnv: "true",
		});
		expect(result).toBeNull();
	});

	test("enforces allowlist prefixes when provided", () => {
		const allowed = resolveRequestedWorkspaceRoot({
			rawWorkspaceRoot: "/home/armando/projects/bardo-testing",
			allowOverrideEnv: "true",
			allowlistEnv: "/home/armando/projects,/tmp",
		});
		const blocked = resolveRequestedWorkspaceRoot({
			rawWorkspaceRoot: "/etc",
			allowOverrideEnv: "true",
			allowlistEnv: "/home/armando/projects,/tmp",
		});
		expect(allowed).toBe("/home/armando/projects/bardo-testing");
		expect(blocked).toBeNull();
	});
});
