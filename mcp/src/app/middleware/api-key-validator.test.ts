import { describe, expect, test } from "bun:test";
import {
	createHostedIntrospectionApiKeyValidator,
	resolveRuntimeApiKeyValidator,
} from "./api-key-validator";

describe("createHostedIntrospectionApiKeyValidator", () => {
	test("sends introspection token in x-bardo-introspection-token header", async () => {
		const seenHeaders: string[] = [];
		let seenAuthorization: string | null = null;
		let seenWorkspaceRoot: string | null = null;
		const fetchMock = async (_input: unknown, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			const header = headers.get("x-bardo-introspection-token");
			if (header) {
				seenHeaders.push(header);
			}
			seenAuthorization = headers.get("authorization");
			if (typeof init?.body === "string") {
				const parsed = JSON.parse(init.body) as { workspaceRoot?: string };
				seenWorkspaceRoot = parsed.workspaceRoot ?? null;
			}
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
				introspectionToken: "secret",
				cacheTtlMs: 30_000,
				fetchImpl,
			},
			"/repo",
		);

		await validator("key", { workspaceRoot: "/tmp/workspace" });
		expect(seenHeaders).toContain("secret");
		expect(seenAuthorization).toBeNull();
		expect(seenWorkspaceRoot === "/tmp/workspace").toBe(true);
	});

	test("returns campaign path when introspection marks key as valid", async () => {
		const fetchMock = async () =>
			new Response(
				JSON.stringify({
					valid: true,
					campaignBasePath: "./customers/alice",
					subjectId: "user_123",
					keyId: "key_123",
					plan: "solo",
					mcpPeriodLimit: 25000,
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
			subjectId: "user_123",
			keyId: "key_123",
			plan: "solo",
			mcpPeriodLimit: 25000,
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

	test("does not cache non-200 responses", async () => {
		let calls = 0;
		const fetchMock = async () => {
			calls += 1;
			if (calls === 1) {
				return new Response("upstream unavailable", { status: 503 });
			}
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

		const first = await validator("key");
		const second = await validator("key");

		expect(first).toBeNull();
		expect(second).toEqual({
			apiKey: "key",
			campaignBasePath: "/repo/customers/alice",
			subjectId: null,
			keyId: null,
			plan: null,
			mcpPeriodLimit: null,
		});
		expect(calls).toBe(2);
	});

	test("scopes cache to api key metadata (workspace root)", async () => {
		let calls = 0;
		const seenWorkspaceRoots: string[] = [];
		const fetchMock = async (_input: unknown, init?: RequestInit) => {
			calls += 1;
			if (typeof init?.body === "string") {
				const parsed = JSON.parse(init.body) as { workspaceRoot?: string };
				seenWorkspaceRoots.push(parsed.workspaceRoot ?? "");
			}
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

		await validator("key", { workspaceRoot: "/tmp/work-a" });
		await validator("key", { workspaceRoot: "/tmp/work-b" });

		expect(calls).toBe(2);
		expect(seenWorkspaceRoots).toEqual(["/tmp/work-a", "/tmp/work-b"]);
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

	test("forwards metadata to hosted introspection in hybrid mode", async () => {
		const previousFetch = globalThis.fetch;
		let seenBody: Record<string, unknown> | null = null;
		globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
			if (typeof init?.body === "string") {
				seenBody = JSON.parse(init.body) as Record<string, unknown>;
			}
			return new Response(
				JSON.stringify({
					valid: true,
					campaignBasePath: "./customers/alice",
				}),
				{ status: 200 },
			);
		}) as typeof fetch;

		try {
			const resolved = resolveRuntimeApiKeyValidator({
				env: {
					BARDO_AUTH_PROVIDER: "hybrid",
					BARDO_AUTH_INTROSPECTION_URL: "https://example.com/introspect",
				},
				apiKeyMap: new Map([["fallback", "/repo/customers/fallback"]]),
				projectRoot: "/repo",
			});
			const validateApiKey = resolved.validateApiKey;
			expect(validateApiKey).not.toBeNull();
			if (!validateApiKey) {
				return;
			}

			const result = await validateApiKey("key", {
				requiredScope: "api",
				workspaceRoot: "/tmp/workspace",
				providerId: "openai",
				modelId: "gpt-5",
			});

			expect(result).toEqual({
				apiKey: "key",
				campaignBasePath: "/repo/customers/alice",
				subjectId: null,
				keyId: null,
				plan: null,
				mcpPeriodLimit: null,
			});
			expect(seenBody).toMatchObject({
				requiredScope: "api",
				workspaceRoot: "/tmp/workspace",
				providerId: "openai",
				modelId: "gpt-5",
			});
		} finally {
			globalThis.fetch = previousFetch;
		}
	});
});
