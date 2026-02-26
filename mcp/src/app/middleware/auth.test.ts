import { describe, expect, test } from "bun:test";
import type { SecurityPolicy } from "../../domain/config/security";
import type { Session } from "../../types/contracts";
import { createAuthenticator } from "./auth";

function createPolicy(overrides: Partial<SecurityPolicy> = {}): SecurityPolicy {
	return {
		authMode: "optional",
		allowQueryApiKey: true,
		maxRequestBytes: 1_048_576,
		sessionTtlMs: 3_600_000,
		rateLimitMaxRequests: 120,
		rateLimitWindowMs: 60_000,
		rateLimitFailClosed: false,
		telemetryEnabled: true,
		metricsRouteEnabled: true,
		metricsRequireAuth: false,
		transportMode: "stateful",
		mcpEnableJsonResponse: false,
		...overrides,
	};
}

function createSession(
	apiKey: string | null,
	campaignBasePath: string,
): Session {
	return {
		apiKey,
		campaignBasePath,
		server: {} as Session["server"],
		transport: {} as Session["transport"],
	};
}

async function responseBody(response: Response) {
	return (await response.json()) as { error?: string };
}

describe("createAuthenticator", () => {
	test("returns optional unauthenticated context when auth is optional and no keys configured", async () => {
		const authenticate = createAuthenticator({
			apiKeyMap: new Map(),
			policy: createPolicy({ authMode: "optional" }),
			projectRoot: "/repo",
		});

		const result = await authenticate(
			new Request("http://localhost:3000/mcp"),
			new Map(),
		);
		expect(result instanceof Response).toBe(false);
		expect(result).toEqual({ apiKey: null, campaignBasePath: "/repo" });
	});

	test("rejects when auth is required but no keys are configured", async () => {
		const authenticate = createAuthenticator({
			apiKeyMap: new Map(),
			policy: createPolicy({ authMode: "required" }),
			projectRoot: "/repo",
		});

		const result = await authenticate(
			new Request("http://localhost:3000/mcp"),
			new Map(),
		);
		expect(result instanceof Response).toBe(true);
		if (!(result instanceof Response)) return;

		expect(result.status).toBe(503);
		expect(await responseBody(result)).toEqual({
			error:
				"Authentication is required but BARDO_API_KEYS_JSON is not configured.",
		});
	});

	test("rejects query API key when policy disables it", async () => {
		const authenticate = createAuthenticator({
			apiKeyMap: new Map([["key-1", "/repo/customers/a"]]),
			policy: createPolicy({ allowQueryApiKey: false }),
			projectRoot: "/repo",
		});

		const request = new Request("http://localhost:3000/mcp?apiKey=key-1");
		const result = await authenticate(request, new Map());

		expect(result instanceof Response).toBe(true);
		if (!(result instanceof Response)) return;
		expect(result.status).toBe(401);
		expect((await responseBody(result)).error).toContain("Missing API key");
	});

	test("accepts valid header API key", async () => {
		const authenticate = createAuthenticator({
			apiKeyMap: new Map([["key-1", "/repo/customers/a"]]),
			policy: createPolicy(),
			projectRoot: "/repo",
		});

		const request = new Request("http://localhost:3000/mcp", {
			headers: { "x-api-key": "key-1" },
		});
		const result = await authenticate(request, new Map());

		expect(result instanceof Response).toBe(false);
		expect(result).toEqual({
			apiKey: "key-1",
			campaignBasePath: "/repo/customers/a",
		});
	});

	test("accepts BARDO_API_KEY header as primary auth header", async () => {
		const authenticate = createAuthenticator({
			apiKeyMap: new Map([["key-1", "/repo/customers/a"]]),
			policy: createPolicy(),
			projectRoot: "/repo",
		});

		const request = new Request("http://localhost:3000/mcp", {
			headers: { BARDO_API_KEY: "key-1" },
		});
		const result = await authenticate(request, new Map());

		expect(result instanceof Response).toBe(false);
		expect(result).toEqual({
			apiKey: "key-1",
			campaignBasePath: "/repo/customers/a",
		});
	});

	test("accepts API key from hosted validator", async () => {
		const authenticate = createAuthenticator({
			apiKeyMap: new Map(),
			policy: createPolicy({ authMode: "required" }),
			projectRoot: "/repo",
			validateApiKey: async (apiKey) => {
				if (apiKey !== "hosted-key") return null;
				return { apiKey, campaignBasePath: "/repo/customers/hosted" };
			},
		});

		const request = new Request("http://localhost:3000/mcp", {
			headers: { BARDO_API_KEY: "hosted-key" },
		});
		const result = await authenticate(request, new Map());

		expect(result instanceof Response).toBe(false);
		expect(result).toEqual({
			apiKey: "hosted-key",
			campaignBasePath: "/repo/customers/hosted",
		});
	});

	test("reuses existing authenticated session when request API key matches", async () => {
		let validateCalls = 0;
		const authenticate = createAuthenticator({
			apiKeyMap: new Map(),
			policy: createPolicy({ authMode: "required" }),
			projectRoot: "/repo",
			validateApiKey: async (apiKey) => {
				validateCalls += 1;
				if (apiKey !== "key-1") return null;
				return { apiKey, campaignBasePath: "/repo/customers/a" };
			},
		});

		const sessions = new Map<string, Session>([
			["session-1", createSession("key-1", "/repo/customers/a")],
		]);
		const request = new Request("http://localhost:3000/mcp", {
			headers: {
				"mcp-session-id": "session-1",
				"x-api-key": "key-1",
			},
		});

		const result = await authenticate(request, sessions);
		expect(result instanceof Response).toBe(false);
		expect(result).toEqual({
			apiKey: "key-1",
			campaignBasePath: "/repo/customers/a",
		});
		expect(validateCalls).toBe(0);
	});

	test("rejects session when API key does not match bound session", async () => {
		const authenticate = createAuthenticator({
			apiKeyMap: new Map([
				["key-1", "/repo/customers/a"],
				["key-2", "/repo/customers/b"],
			]),
			policy: createPolicy(),
			projectRoot: "/repo",
		});

		const sessions = new Map<string, Session>([
			["session-1", createSession("key-1", "/repo/customers/a")],
		]);
		const request = new Request("http://localhost:3000/mcp", {
			headers: {
				"mcp-session-id": "session-1",
				"x-api-key": "key-2",
			},
		});

		const result = await authenticate(request, sessions);
		expect(result instanceof Response).toBe(true);
		if (!(result instanceof Response)) return;
		expect(result.status).toBe(403);
		expect(await responseBody(result)).toEqual({
			error: "Session does not belong to this API key.",
		});
	});

	test("enforces workspace root header when BARDO_REQUIRE_WORKSPACE_ROOT is enabled", async () => {
		const previous = Bun.env.BARDO_REQUIRE_WORKSPACE_ROOT;
		Bun.env.BARDO_REQUIRE_WORKSPACE_ROOT = "true";
		try {
			const authenticate = createAuthenticator({
				apiKeyMap: new Map([["key-1", "/repo/customers/a"]]),
				policy: createPolicy(),
				projectRoot: "/repo",
			});

			const request = new Request("http://localhost:3000/mcp", {
				headers: { "x-api-key": "key-1" },
			});
			const result = await authenticate(request, new Map());

			expect(result instanceof Response).toBe(true);
			if (!(result instanceof Response)) return;
			expect(result.status).toBe(400);
			expect(await responseBody(result)).toEqual({
				error: "Missing required x-bardo-workspace-root header.",
			});
		} finally {
			if (previous === undefined) {
				delete Bun.env.BARDO_REQUIRE_WORKSPACE_ROOT;
			} else {
				Bun.env.BARDO_REQUIRE_WORKSPACE_ROOT = previous;
			}
		}
	});
});
