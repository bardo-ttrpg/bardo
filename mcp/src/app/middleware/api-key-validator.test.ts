import { describe, expect, test } from "bun:test";
import {
	createHostedIntrospectionApiKeyValidator,
	resolveRuntimeApiKeyValidator,
} from "./api-key-validator";

describe("createHostedIntrospectionApiKeyValidator", () => {
	test("returns campaign path when introspection marks key as valid", async () => {
		const fetchMock = async () =>
			new Response(
				JSON.stringify({
					valid: true,
					campaignBasePath: "./customers/alice",
				}),
				{ status: 200 },
			);
		const fetchImpl = fetchMock as unknown as typeof fetch;

		const validator = createHostedIntrospectionApiKeyValidator(
			{
				introspectionUrl: "https://example.com/introspect",
				introspectionToken: "secret",
				cacheTtlMs: 30_000,
				fetchImpl,
			},
			"/repo",
		);

		const result = await validator("key");
		expect(result).toEqual({
			apiKey: "key",
			campaignBasePath: "/repo/customers/alice",
		});
	});

	test("caches introspection responses per key", async () => {
		let calls = 0;
		const fetchMock = async () => {
			calls += 1;
			return new Response(
				JSON.stringify({
					valid: true,
					campaignBasePath: "./customers/alice",
				}),
				{ status: 200 },
			);
		};
		const fetchImpl = fetchMock as unknown as typeof fetch;

		const validator = createHostedIntrospectionApiKeyValidator(
			{
				introspectionUrl: "https://example.com/introspect",
				introspectionToken: null,
				cacheTtlMs: 30_000,
				fetchImpl,
			},
			"/repo",
		);

		await validator("key");
		await validator("key");
		expect(calls).toBe(1);
	});
});

describe("resolveRuntimeApiKeyValidator", () => {
	test("prefers env mode by default when no introspection URL exists", async () => {
		const resolved = resolveRuntimeApiKeyValidator({
			env: {},
			apiKeyMap: new Map([["k", "/repo/customers/a"]]),
			projectRoot: "/repo",
		});
		expect(resolved.mode).toBe("env");
		expect(await resolved.validateApiKey?.("k")).toEqual({
			apiKey: "k",
			campaignBasePath: "/repo/customers/a",
		});
	});

	test("uses hybrid mode when introspection URL exists", () => {
		const resolved = resolveRuntimeApiKeyValidator({
			env: { BARDO_AUTH_INTROSPECTION_URL: "https://example.com/introspect" },
			apiKeyMap: new Map(),
			projectRoot: "/repo",
		});
		expect(resolved.mode).toBe("hybrid");
		expect(resolved.validateApiKey).not.toBeNull();
	});
});
