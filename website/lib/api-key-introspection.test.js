import { describe, expect, test } from "bun:test";
import {
	createIntrospectionSecretValidator,
	looksLikeClerkApiKey,
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

	test("returns null when override is enabled without an allowlist", () => {
		const result = resolveRequestedWorkspaceRoot({
			rawWorkspaceRoot: "/home/armando/projects/bardo-testing",
			allowOverrideEnv: "true",
		});
		expect(result).toBeNull();
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

	test("rejects workspace roots that include null bytes even with an allowlist", () => {
		const result = resolveRequestedWorkspaceRoot({
			rawWorkspaceRoot: "/home/armando/projects/bardo-testing\0/tmp",
			allowOverrideEnv: "true",
			allowlistEnv: "/home/armando/projects",
		});
		expect(result).toBeNull();
	});
});

describe("looksLikeClerkApiKey", () => {
	test("accepts Clerk API key prefixes", () => {
		expect(looksLikeClerkApiKey("ak_live_123")).toBe(true);
		expect(looksLikeClerkApiKey(" ak_test_123 ")).toBe(true);
	});

	test("rejects bridge tokens and legacy direct tokens", () => {
		expect(looksLikeClerkApiKey("bardo_live_saved")).toBe(false);
		expect(looksLikeClerkApiKey("bridge_access_token")).toBe(false);
		expect(looksLikeClerkApiKey("")).toBe(false);
		expect(looksLikeClerkApiKey(undefined)).toBe(false);
	});
});
