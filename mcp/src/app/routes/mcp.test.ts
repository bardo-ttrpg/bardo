import { describe, expect, test } from "bun:test";
import { resolveLoopDetectionPolicy } from "../../domain/config/loop-detection";
import { resolveToolPolicyConfig } from "../../domain/config/tool-policy";
import { SessionRegistry } from "../../session/session-registry";
import { SessionStore } from "../../session/session-store";
import type { AuthContext, Session } from "../../types/contracts";
import { handleMcpRequest } from "./mcp";

function createAuth(): AuthContext {
	return {
		apiKey: "k1",
		campaignBasePath: "/repo/customer-a",
	};
}

function createSession(overrides?: {
	handleRequest?: (request: Request) => Promise<Response> | Response;
}): Session {
	return {
		apiKey: "k1",
		campaignBasePath: "/repo/customer-a",
		server: {} as Session["server"],
		transport: {
			handleRequest:
				overrides?.handleRequest ??
				(async () =>
					new Response(
						JSON.stringify({
							ok: true,
						}),
						{
							status: 200,
							headers: {
								"content-type": "application/json",
							},
						},
					)),
		} as Session["transport"],
	};
}

describe("handleMcpRequest policy and loop protection", () => {
	test("blocks disallowed tools by policy", async () => {
		const sessionStore = new SessionStore();
		const sessionRegistry = new SessionRegistry({
			loopPolicy: resolveLoopDetectionPolicy({
				BARDO_LOOP_DETECTION_ENABLED: "false",
			}),
		});

		sessionStore.set("s1", createSession());
		sessionRegistry.registerSession({
			sessionId: "s1",
			apiKey: "k1",
			campaignBasePath: "/repo/customer-a",
		});

		const request = new Request("http://localhost:3000/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"mcp-session-id": "s1",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "player_action",
					arguments: {
						action: "hello",
					},
				},
			}),
		});

		const response = await handleMcpRequest(
			request,
			createAuth(),
			sessionStore,
			sessionRegistry,
			resolveToolPolicyConfig({
				BARDO_TOOLS_PROFILE: "minimal",
			}),
			resolveLoopDetectionPolicy({
				BARDO_LOOP_DETECTION_ENABLED: "false",
			}),
			true,
		);

		expect(response.status).toBe(403);
		const payload = (await response.json()) as { error?: { message?: string } };
		expect(payload.error?.message).toContain("not allowed");
	});

	test("blocks repeated tool loops when threshold is reached", async () => {
		const sessionStore = new SessionStore();
		const sessionRegistry = new SessionRegistry({
			loopPolicy: resolveLoopDetectionPolicy({
				BARDO_LOOP_WARNING_THRESHOLD: "1",
				BARDO_LOOP_CRITICAL_THRESHOLD: "2",
				BARDO_LOOP_GLOBAL_CIRCUIT_BREAKER_THRESHOLD: "3",
			}),
		});

		sessionStore.set("s1", createSession());
		sessionRegistry.registerSession({
			sessionId: "s1",
			apiKey: "k1",
			campaignBasePath: "/repo/customer-a",
		});

		const makeRequest = () =>
			new Request("http://localhost:3000/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"mcp-session-id": "s1",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "tools/call",
					params: {
						name: "context_query",
						arguments: {
							query: "same",
						},
					},
				}),
			});

		const toolPolicy = resolveToolPolicyConfig({
			BARDO_TOOLS_PROFILE: "full",
		});
		const loopPolicy = resolveLoopDetectionPolicy({
			BARDO_LOOP_WARNING_THRESHOLD: "1",
			BARDO_LOOP_CRITICAL_THRESHOLD: "2",
			BARDO_LOOP_GLOBAL_CIRCUIT_BREAKER_THRESHOLD: "3",
		});

		const first = await handleMcpRequest(
			makeRequest(),
			createAuth(),
			sessionStore,
			sessionRegistry,
			toolPolicy,
			loopPolicy,
			true,
		);
		expect(first.status).toBe(200);

		const second = await handleMcpRequest(
			makeRequest(),
			createAuth(),
			sessionStore,
			sessionRegistry,
			toolPolicy,
			loopPolicy,
			true,
		);
		expect(second.status).toBe(429);
	});

	test("blocks disallowed tools inside JSON-RPC batch payloads", async () => {
		const sessionStore = new SessionStore();
		const sessionRegistry = new SessionRegistry({
			loopPolicy: resolveLoopDetectionPolicy({
				BARDO_LOOP_DETECTION_ENABLED: "false",
			}),
		});
		let forwardedRequests = 0;

		sessionStore.set(
			"s1",
			createSession({
				handleRequest: async () => {
					forwardedRequests += 1;
					return new Response(
						JSON.stringify({
							ok: true,
						}),
						{
							status: 200,
							headers: {
								"content-type": "application/json",
							},
						},
					);
				},
			}),
		);
		sessionRegistry.registerSession({
			sessionId: "s1",
			apiKey: "k1",
			campaignBasePath: "/repo/customer-a",
		});

		const request = new Request("http://localhost:3000/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"mcp-session-id": "s1",
			},
			body: JSON.stringify([
				{
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: {
						name: "player_action",
						arguments: {
							action: "hello",
						},
					},
				},
			]),
		});

		const response = await handleMcpRequest(
			request,
			createAuth(),
			sessionStore,
			sessionRegistry,
			resolveToolPolicyConfig({
				BARDO_TOOLS_PROFILE: "minimal",
			}),
			resolveLoopDetectionPolicy({
				BARDO_LOOP_DETECTION_ENABLED: "false",
			}),
			true,
		);

		expect(response.status).toBe(403);
		expect(forwardedRequests).toBe(0);
		const payload = (await response.json()) as { error?: { message?: string } };
		expect(payload.error?.message).toContain("not allowed");
	});

	test("stateless mode rejects GET and DELETE session transport methods", async () => {
		const sessionStore = new SessionStore();
		const sessionRegistry = new SessionRegistry({
			loopPolicy: resolveLoopDetectionPolicy({
				BARDO_LOOP_DETECTION_ENABLED: "false",
			}),
		});
		const toolPolicy = resolveToolPolicyConfig({
			BARDO_TOOLS_PROFILE: "full",
		});
		const loopPolicy = resolveLoopDetectionPolicy({
			BARDO_LOOP_DETECTION_ENABLED: "false",
		});

		const getResponse = await handleMcpRequest(
			new Request("http://localhost:3000/mcp", {
				method: "GET",
			}),
			createAuth(),
			sessionStore,
			sessionRegistry,
			toolPolicy,
			loopPolicy,
			true,
			{
				transportMode: "stateless",
				enableJsonResponse: true,
			},
		);
		expect(getResponse.status).toBe(405);
		expect(getResponse.headers.get("allow")).toBe("POST, OPTIONS");

		const deleteResponse = await handleMcpRequest(
			new Request("http://localhost:3000/mcp", {
				method: "DELETE",
			}),
			createAuth(),
			sessionStore,
			sessionRegistry,
			toolPolicy,
			loopPolicy,
			true,
			{
				transportMode: "stateless",
				enableJsonResponse: true,
			},
		);
		expect(deleteResponse.status).toBe(405);
		expect(deleteResponse.headers.get("allow")).toBe("POST, OPTIONS");
	});

	test("enforces setup contract v2 header for setup-sensitive tools when enabled", async () => {
		const previous = Bun.env.BARDO_SETUP_CONTRACT_V2_REQUIRED;
		Bun.env.BARDO_SETUP_CONTRACT_V2_REQUIRED = "true";
		try {
			const sessionStore = new SessionStore();
			const sessionRegistry = new SessionRegistry({
				loopPolicy: resolveLoopDetectionPolicy({
					BARDO_LOOP_DETECTION_ENABLED: "false",
				}),
			});
			sessionStore.set("s1", createSession());
			sessionRegistry.registerSession({
				sessionId: "s1",
				apiKey: "k1",
				campaignBasePath: "/repo/customer-a",
			});

			const request = new Request("http://localhost:3000/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"mcp-session-id": "s1",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: {
						name: "player_action",
						arguments: { action: "I begin." },
					},
				}),
			});

			const response = await handleMcpRequest(
				request,
				createAuth(),
				sessionStore,
				sessionRegistry,
				resolveToolPolicyConfig({
					BARDO_TOOLS_PROFILE: "full",
				}),
				resolveLoopDetectionPolicy({
					BARDO_LOOP_DETECTION_ENABLED: "false",
				}),
				true,
			);

			expect(response.status).toBe(428);
			const payload = (await response.json()) as {
				error?: { message?: string };
			};
			expect(payload.error?.message).toContain("setup contract v2");
		} finally {
			if (previous === undefined) {
				delete Bun.env.BARDO_SETUP_CONTRACT_V2_REQUIRED;
			} else {
				Bun.env.BARDO_SETUP_CONTRACT_V2_REQUIRED = previous;
			}
		}
	});

	test("allows setup-sensitive tools when setup contract v2 header is present", async () => {
		const previous = Bun.env.BARDO_SETUP_CONTRACT_V2_REQUIRED;
		Bun.env.BARDO_SETUP_CONTRACT_V2_REQUIRED = "true";
		try {
			const sessionStore = new SessionStore();
			const sessionRegistry = new SessionRegistry({
				loopPolicy: resolveLoopDetectionPolicy({
					BARDO_LOOP_DETECTION_ENABLED: "false",
				}),
			});

			let forwarded = 0;
			sessionStore.set(
				"s1",
				createSession({
					handleRequest: async () => {
						forwarded += 1;
						return new Response(JSON.stringify({ ok: true }), {
							status: 200,
							headers: { "content-type": "application/json" },
						});
					},
				}),
			);
			sessionRegistry.registerSession({
				sessionId: "s1",
				apiKey: "k1",
				campaignBasePath: "/repo/customer-a",
			});

			const request = new Request("http://localhost:3000/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"mcp-session-id": "s1",
					"x-bardo-setup-contract-version": "2.0",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: {
						name: "init",
						arguments: {},
					},
				}),
			});

			const response = await handleMcpRequest(
				request,
				createAuth(),
				sessionStore,
				sessionRegistry,
				resolveToolPolicyConfig({
					BARDO_TOOLS_PROFILE: "full",
				}),
				resolveLoopDetectionPolicy({
					BARDO_LOOP_DETECTION_ENABLED: "false",
				}),
				true,
			);

			expect(response.status).toBe(200);
			expect(forwarded).toBe(1);
		} finally {
			if (previous === undefined) {
				delete Bun.env.BARDO_SETUP_CONTRACT_V2_REQUIRED;
			} else {
				Bun.env.BARDO_SETUP_CONTRACT_V2_REQUIRED = previous;
			}
		}
	});
});
