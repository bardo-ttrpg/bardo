import { describe, expect, test } from "bun:test";
import type { SecurityPolicy } from "../domain/config/security";
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
});
