import { describe, expect, test } from "bun:test";
import type { SecurityPolicy } from "../domain/config/security";
import { resolveToolPolicyConfig } from "../domain/config/tool-policy";
import { SessionRegistry } from "../session/session-registry";
import { SessionStore } from "../session/session-store";
import { createHttpRequestHandler } from "./server";

function makePolicy(overrides: Partial<SecurityPolicy> = {}): SecurityPolicy {
	return {
		authMode: "optional",
		allowQueryApiKey: true,
		maxRequestBytes: 1_048_576,
		sessionTtlMs: 3_600_000,
		rateLimitWindowMs: 60_000,
		rateLimitMaxRequests: 120,
		rateLimitFailClosed: false,
		telemetryEnabled: false,
		metricsRouteEnabled: false,
		metricsRequireAuth: false,
		transportMode: "stateful",
		mcpEnableJsonResponse: false,
		...overrides,
	};
}

describe("createHttpRequestHandler HTTP smoke tests", () => {
	test("serves /health with the expected JSON contract", async () => {
		const handler = createHttpRequestHandler({
			securityPolicy: makePolicy(),
		});

		const response = await handler(new Request("http://localhost/health"));
		const body = (await response.json()) as {
			status?: string;
			authRequired?: boolean;
			configuredApiKeys?: number;
		};

		expect(response.status).toBe(200);
		expect(body.status).toBe("ok");
		expect(typeof body.authRequired).toBe("boolean");
		expect(typeof body.configuredApiKeys).toBe("number");
	});

	test("rejects unauthenticated MCP requests at the HTTP boundary", async () => {
		const handler = createHttpRequestHandler({
			securityPolicy: makePolicy({
				authMode: "optional",
			}),
		});

		const response = await handler(
			new Request("http://localhost/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
					params: {
						protocolVersion: "2025-03-26",
						capabilities: {},
						clientInfo: { name: "test", version: "1.0.0" },
					},
				}),
			}),
		);
		const body = (await response.json()) as { error?: string };

		expect(response.status).toBe(401);
		expect(body.error).toContain("Missing API key");
	});

	test("forwards authenticated session requests over the HTTP boundary", async () => {
		const sessionStore = new SessionStore();
		const sessionRegistry = new SessionRegistry();
		sessionStore.set("session_123", {
			apiKey: "test-key",
			campaignBasePath: process.cwd(),
			subjectId: null,
			keyId: null,
			plan: null,
			mcpPeriodLimit: null,
			server: {} as never,
			transport: {
				handleRequest: async () =>
					new Response(
						JSON.stringify({
							jsonrpc: "2.0",
							id: 1,
							result: {
								tools: [{ name: "init" }],
							},
						}),
						{
							status: 200,
							headers: {
								"content-type": "application/json",
							},
						},
					),
			} as never,
		});
		sessionRegistry.registerSession({
			sessionId: "session_123",
			apiKey: "test-key",
			campaignBasePath: process.cwd(),
		});

		const handler = createHttpRequestHandler({
			securityPolicy: makePolicy({
				transportMode: "stateful",
			}),
			sessionStore,
			sessionRegistry,
		});

		const response = await handler(
			new Request("http://localhost/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"mcp-session-id": "session_123",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/list",
					params: {},
				}),
			}),
		);
		const body = (await response.json()) as {
			result?: { tools?: Array<{ name?: string }> };
		};

		expect(response.status).toBe(200);
		expect(Array.isArray(body.result?.tools)).toBe(true);
		expect(body.result?.tools?.some((tool) => tool.name === "init")).toBe(true);
	});

	test("returns timestamp_skew for validate-and-meter calls with stale timestamps", async () => {
		const sessionStore = new SessionStore();
		const sessionRegistry = new SessionRegistry();
		sessionStore.set("session_validate_1", {
			apiKey: "test-key",
			campaignBasePath: process.cwd(),
			subjectId: "user_1",
			keyId: "key_1",
			plan: "free",
			mcpPeriodLimit: 100,
			server: {} as never,
			transport: {} as never,
		});
		sessionRegistry.registerSession({
			sessionId: "session_validate_1",
			apiKey: "test-key",
			campaignBasePath: process.cwd(),
		});
		const handler = createHttpRequestHandler({
			securityPolicy: makePolicy({
				authMode: "optional",
			}),
			sessionStore,
			sessionRegistry,
			usageLimiter: {
				async check() {
					return {
						allowed: true,
						limit: 100,
						usedThisPeriod: 1,
						remaining: 99,
						period: "2026-03",
						backend: "memory",
					};
				},
				async consume() {
					return {
						allowed: true,
						limit: 100,
						usedThisPeriod: 1,
						remaining: 99,
						period: "2026-03",
						backend: "memory",
					};
				},
				reset() {},
			},
		});

		const response = await handler(
			new Request("http://localhost/api/v1/validate-and-meter", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-bardo-timestamp": "1000",
					"mcp-session-id": "session_validate_1",
				},
				body: JSON.stringify({
					tool: "bardo_workspace_status",
					action: "invoke",
					workspace_id: "/tmp/workspace",
				}),
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			valid: false,
			reason: "timestamp_skew",
		});
	});

	test("accepts validate-and-meter calls with current timestamp", async () => {
		const sessionStore = new SessionStore();
		const sessionRegistry = new SessionRegistry();
		sessionStore.set("session_validate_2", {
			apiKey: "test-key",
			campaignBasePath: process.cwd(),
			subjectId: "user_1",
			keyId: "key_1",
			plan: "free",
			mcpPeriodLimit: 100,
			server: {} as never,
			transport: {} as never,
		});
		sessionRegistry.registerSession({
			sessionId: "session_validate_2",
			apiKey: "test-key",
			campaignBasePath: process.cwd(),
		});
		const handler = createHttpRequestHandler({
			securityPolicy: makePolicy({
				authMode: "optional",
			}),
			sessionStore,
			sessionRegistry,
			usageLimiter: {
				async check() {
					return {
						allowed: true,
						limit: 100,
						usedThisPeriod: 1,
						remaining: 99,
						period: "2026-03",
						backend: "memory",
					};
				},
				async consume() {
					return {
						allowed: true,
						limit: 100,
						usedThisPeriod: 1,
						remaining: 99,
						period: "2026-03",
						backend: "memory",
					};
				},
				reset() {},
			},
		});
		const now = Date.now();
		const response = await handler(
			new Request("http://localhost/api/v1/validate-and-meter", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-bardo-timestamp": String(now),
					"mcp-session-id": "session_validate_2",
				},
				body: JSON.stringify({
					tool: "bardo_workspace_status",
					action: "invoke",
					workspace_id: "/tmp/workspace",
				}),
			}),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			valid: true,
		});
	});

	test("deduplicates repeated reconciliation entries by id before charging units", async () => {
		const sessionStore = new SessionStore();
		const sessionRegistry = new SessionRegistry();
		sessionStore.set("session_validate_4", {
			apiKey: "test-key",
			campaignBasePath: process.cwd(),
			subjectId: "user_4",
			keyId: "key_4",
			plan: "free",
			mcpPeriodLimit: 100,
			server: {} as never,
			transport: {} as never,
		});
		sessionRegistry.registerSession({
			sessionId: "session_validate_4",
			apiKey: "test-key",
			campaignBasePath: process.cwd(),
		});
		let chargedUnits = 0;
		const handler = createHttpRequestHandler({
			securityPolicy: makePolicy({
				authMode: "optional",
			}),
			sessionStore,
			sessionRegistry,
			usageLimiter: {
				async check() {
					return {
						allowed: true,
						limit: 100,
						usedThisPeriod: 1,
						remaining: 99,
						period: "2026-03",
						backend: "memory",
					};
				},
				async consume(input) {
					const units = input.units ?? 0;
					chargedUnits = units;
					return {
						allowed: true,
						limit: 100,
						usedThisPeriod: units,
						remaining: 100 - units,
						period: "2026-03",
						backend: "memory",
					};
				},
				reset() {},
			},
		});
		const now = Date.now();
		const response = await handler(
			new Request("http://localhost/api/v1/validate-and-meter", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-bardo-timestamp": String(now),
					"mcp-session-id": "session_validate_4",
				},
				body: JSON.stringify({
					tool: "bardo_workspace_status",
					action: "invoke",
					workspace_id: "/tmp/workspace",
					reconciliation: {
						batch_id: "batch-1",
						entries: [
							{
								id: "entry-1",
								ts: now - 1000,
								tool: "bardo_workspace_read_text",
								action: "invoke",
								units: 1,
								workspace_id: "/tmp/workspace",
							},
							{
								id: "entry-1",
								ts: now - 1000,
								tool: "bardo_workspace_read_text",
								action: "invoke",
								units: 1,
								workspace_id: "/tmp/workspace",
							},
						],
					},
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(chargedUnits).toBe(2);
		await expect(response.json()).resolves.toMatchObject({
			valid: true,
		});
	});

	test("accepts legacy /api/auth/introspect-key fallback requests for one-release compatibility", async () => {
		const sessionStore = new SessionStore();
		const sessionRegistry = new SessionRegistry();
		sessionStore.set("session_validate_3", {
			apiKey: "test-key",
			campaignBasePath: process.cwd(),
			subjectId: "user_legacy",
			keyId: "key_legacy",
			plan: "free",
			mcpPeriodLimit: 100,
			server: {} as never,
			transport: {} as never,
		});
		sessionRegistry.registerSession({
			sessionId: "session_validate_3",
			apiKey: "test-key",
			campaignBasePath: process.cwd(),
		});
		const handler = createHttpRequestHandler({
			securityPolicy: makePolicy({
				authMode: "optional",
			}),
			sessionStore,
			sessionRegistry,
			usageLimiter: {
				async check() {
					return {
						allowed: true,
						limit: 100,
						usedThisPeriod: 1,
						remaining: 99,
						period: "2026-03",
						backend: "memory",
					};
				},
				async consume() {
					return {
						allowed: true,
						limit: 100,
						usedThisPeriod: 2,
						remaining: 98,
						period: "2026-03",
						backend: "memory",
					};
				},
				reset() {},
			},
		});
		const now = Date.now();
		const response = await handler(
			new Request("http://localhost/api/auth/introspect-key", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-bardo-timestamp": String(now),
					"mcp-session-id": "session_validate_3",
				},
				body: JSON.stringify({
					tool: "bardo_workspace_status",
					action: "invoke",
					workspace_id: "/tmp/workspace",
				}),
			}),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			valid: true,
		});
	});

	test("blocks metered MCP tool calls before executing transport when quota is exhausted", async () => {
		const sessionStore = new SessionStore();
		const sessionRegistry = new SessionRegistry();
		let transportCalled = false;
		let checked = 0;
		let charged = 0;
		sessionStore.set("session_quota_1", {
			apiKey: "test-key",
			campaignBasePath: process.cwd(),
			subjectId: "user_quota",
			keyId: "key_quota",
			plan: "solo",
			mcpPeriodLimit: 1,
			server: {} as never,
			transport: {
				handleRequest: async () => {
					transportCalled = true;
					return new Response(
						JSON.stringify({
							jsonrpc: "2.0",
							id: 1,
							result: {
								structuredContent: {
									success: true,
								},
							},
						}),
						{
							status: 200,
							headers: {
								"content-type": "application/json",
							},
						},
					);
				},
			} as never,
		});
		sessionRegistry.registerSession({
			sessionId: "session_quota_1",
			apiKey: "test-key",
			campaignBasePath: process.cwd(),
		});

		const handler = createHttpRequestHandler({
			securityPolicy: makePolicy({
				authMode: "optional",
				transportMode: "stateful",
				mcpEnableJsonResponse: true,
			}),
			sessionStore,
			sessionRegistry,
			usageLimiter: {
				async check() {
					checked += 1;
					return {
						allowed: false,
						limit: 1,
						usedThisPeriod: 1,
						remaining: 0,
						period: "2026-03",
						backend: "none",
					};
				},
				async consume() {
					charged += 1;
					return {
						allowed: false,
						limit: 1,
						usedThisPeriod: 1,
						remaining: 0,
						period: "2026-03",
						backend: "none",
					};
				},
				reset() {},
			},
		});

		const response = await handler(
			new Request("http://localhost/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"mcp-session-id": "session_quota_1",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: {
						name: "context_query",
						arguments: {
							query: "thornwick",
						},
					},
				}),
			}),
		);

		expect(response.status).toBe(429);
		expect(transportCalled).toBe(false);
		expect(checked).toBe(1);
		expect(charged).toBe(0);
		await expect(response.json()).resolves.toMatchObject({
			error: "MCP usage limit reached for current plan.",
			usage: {
				limit: 1,
				used: 1,
				remaining: 0,
				period: "2026-03",
			},
		});
	});

	test("does not charge usage when a metered MCP tool call is rejected before execution", async () => {
		const sessionStore = new SessionStore();
		const sessionRegistry = new SessionRegistry();
		let checked = 0;
		let charged = 0;
		sessionStore.set("session_policy_1", {
			apiKey: "test-key",
			campaignBasePath: process.cwd(),
			subjectId: "user_policy",
			keyId: "key_policy",
			plan: "solo",
			mcpPeriodLimit: 100,
			server: {} as never,
			transport: {
				handleRequest: async () =>
					new Response("transport should not run", { status: 500 }),
			} as never,
		});
		sessionRegistry.registerSession({
			sessionId: "session_policy_1",
			apiKey: "test-key",
			campaignBasePath: process.cwd(),
		});

		const handler = createHttpRequestHandler({
			securityPolicy: makePolicy({
				authMode: "optional",
				transportMode: "stateful",
				mcpEnableJsonResponse: true,
			}),
			toolPolicy: resolveToolPolicyConfig({
				BARDO_TOOLS_PROFILE: "minimal",
			}),
			sessionStore,
			sessionRegistry,
			usageLimiter: {
				async check() {
					checked += 1;
					return {
						allowed: true,
						limit: 100,
						usedThisPeriod: 0,
						remaining: 100,
						period: "2026-03",
						backend: "none",
					};
				},
				async consume() {
					charged += 1;
					return {
						allowed: true,
						limit: 100,
						usedThisPeriod: 1,
						remaining: 99,
						period: "2026-03",
						backend: "none",
					};
				},
				reset() {},
			},
		});

		const response = await handler(
			new Request("http://localhost/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"mcp-session-id": "session_policy_1",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: {
						name: "player_knowledge_view",
						arguments: {
							action: "hello",
						},
					},
				}),
			}),
		);

		expect(response.status).toBe(403);
		expect(checked).toBe(1);
		expect(charged).toBe(0);
		await expect(response.json()).resolves.toMatchObject({
			error: {
				message: expect.stringContaining("not allowed"),
			},
		});
	});
});
