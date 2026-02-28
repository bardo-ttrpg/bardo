import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveLoopDetectionPolicy } from "../../domain/config/loop-detection";
import { resolveToolPolicyConfig } from "../../domain/config/tool-policy";
import { renderMarkdown } from "../../domain/markdown/markdown";
import { SessionRegistry } from "../../session/session-registry";
import { SessionStore } from "../../session/session-store";
import type { AuthContext } from "../../types/contracts";
import { handleMcpRequest } from "./mcp";
import { handleResolveTurnRequest } from "./turns-orchestrator";

type RecordedCall = {
	method: string;
	body: Record<string, unknown> | null;
};

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function createAuth(campaignBasePath = "/tmp/bardo-tests"): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function jsonRpcResponse(
	payload: Record<string, unknown>,
	options?: { sessionId?: string },
): Response {
	const headers = new Headers({
		"content-type": "application/json",
	});
	if (options?.sessionId) {
		headers.set("mcp-session-id", options.sessionId);
	}
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers,
	});
}

function installFetchMock(
	calls: RecordedCall[],
	options?: {
		toolPayloads?: Record<string, Record<string, unknown>>;
		resourcePayloadByUri?: Record<string, unknown>;
	},
): void {
	globalThis.fetch = (async (
		_url: string | URL | Request,
		init?: RequestInit,
	) => {
		const method = init?.method ?? "GET";
		const rawBody =
			typeof init?.body === "string"
				? init.body
				: init?.body instanceof Uint8Array
					? new TextDecoder().decode(init.body)
					: "";
		const body =
			rawBody.trim().length > 0
				? (JSON.parse(rawBody) as Record<string, unknown>)
				: null;
		calls.push({ method, body });

		if (method === "DELETE") {
			return new Response(null, { status: 200 });
		}

		if (!body) {
			return jsonRpcResponse({
				jsonrpc: "2.0",
				error: { code: -32600, message: "missing body" },
				id: null,
			});
		}

		if (body.method === "initialize") {
			return jsonRpcResponse(
				{
					jsonrpc: "2.0",
					id: body.id ?? 1,
					result: {
						protocolVersion: "2025-03-26",
						serverInfo: { name: "bardo", version: "1.0.0" },
					},
				},
				{ sessionId: "s-1" },
			);
		}

		if (body.method === "notifications/initialized") {
			return jsonRpcResponse({
				jsonrpc: "2.0",
				result: {},
			});
		}

		if (body.method === "prompts/get") {
			return jsonRpcResponse({
				jsonrpc: "2.0",
				id: body.id ?? 1,
				result: {
					description: "resolve action prompt",
					messages: [
						{
							role: "user",
							content: { type: "text", text: "resolve action workflow" },
						},
					],
				},
			});
		}

		if (body.method === "resources/read") {
			const params =
				typeof body.params === "object" && body.params !== null
					? (body.params as Record<string, unknown>)
					: {};
			const uri = typeof params.uri === "string" ? params.uri : "";
			const payloadByUri: Record<string, unknown> = {
				"resource://campaign/current-summary": {
					currentLocation: "river-market",
					stateSource: "projection",
				},
				"resource://scene/current": {
					currentLocationId: "river-market",
				},
				"resource://events/recent-digest": {
					returnedEvents: 2,
				},
				...(options?.resourcePayloadByUri ?? {}),
			};
			return jsonRpcResponse({
				jsonrpc: "2.0",
				id: body.id ?? 1,
				result: {
					contents: [
						{
							uri,
							text: JSON.stringify(payloadByUri[uri] ?? {}),
						},
					],
				},
			});
		}

		if (body.method === "tools/call") {
			const params =
				typeof body.params === "object" && body.params !== null
					? (body.params as Record<string, unknown>)
					: {};
			const name = typeof params.name === "string" ? params.name : "";
			const override = options?.toolPayloads?.[name];
			if (override) {
				return jsonRpcResponse({
					jsonrpc: "2.0",
					id: body.id ?? 1,
					result: {
						structuredContent: override,
					},
				});
			}
			if (name === "context_query") {
				return jsonRpcResponse({
					jsonrpc: "2.0",
					id: body.id ?? 1,
					result: {
						structuredContent: { matches: [] },
					},
				});
			}
			if (name === "player_action") {
				return jsonRpcResponse({
					jsonrpc: "2.0",
					id: body.id ?? 1,
					result: {
						structuredContent: {
							success: true,
							requiresSetup: false,
						},
					},
				});
			}
			if (name === "simulation_tick") {
				return jsonRpcResponse({
					jsonrpc: "2.0",
					id: body.id ?? 1,
					result: {
						structuredContent: { success: true },
					},
				});
			}
			if (name === "consistency_check") {
				return jsonRpcResponse({
					jsonrpc: "2.0",
					id: body.id ?? 1,
					result: {
						structuredContent: { success: true, errorCount: 0 },
					},
				});
			}
		}

		return jsonRpcResponse({
			jsonrpc: "2.0",
			error: { code: -32601, message: "unsupported method in test mock" },
			id: body.id ?? null,
		});
	}) as typeof globalThis.fetch;
}

function installInProcessMcpFetch(args: { auth: AuthContext }): void {
	const sessionStore = new SessionStore();
	const loopPolicy = resolveLoopDetectionPolicy({
		BARDO_LOOP_DETECTION_ENABLED: "false",
	});
	const sessionRegistry = new SessionRegistry({ loopPolicy });
	const toolPolicy = resolveToolPolicyConfig({
		BARDO_TOOLS_PROFILE: "full",
	});

	globalThis.fetch = (async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		const request =
			input instanceof Request ? input : new Request(String(input), init);
		const pathname = new URL(request.url).pathname;
		if (pathname !== "/mcp") {
			return new Response("Not Found", { status: 404 });
		}
		return handleMcpRequest(
			request,
			args.auth,
			sessionStore,
			sessionRegistry,
			toolPolicy,
			loopPolicy,
			false,
		);
	}) as typeof globalThis.fetch;
}

describe("handleResolveTurnRequest", () => {
	test("uses prompts/resources workflow and does not call state_get", async () => {
		const calls: RecordedCall[] = [];
		installFetchMock(calls);

		const request = new Request("http://localhost:3000/turns/resolve", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				action: "I attack the bandit",
			}),
		});
		const response = await handleResolveTurnRequest(
			request,
			createAuth(),
			false,
		);
		const payload = (await response.json()) as {
			success: boolean;
			workflowPrompt: unknown;
			state: { currentLocation?: string } | null;
			resources: { campaignSummary?: { currentLocation?: string } } | null;
		};

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.workflowPrompt).not.toBeNull();
		expect(payload.state?.currentLocation).toBe("river-market");
		expect(payload.resources?.campaignSummary?.currentLocation).toBe(
			"river-market",
		);

		const rpcCalls = calls
			.filter((call) => call.method === "POST" && call.body !== null)
			.map((call) => call.body as Record<string, unknown>);
		expect(rpcCalls.some((body) => body.method === "prompts/get")).toBe(true);
		expect(
			rpcCalls.filter((body) => body.method === "resources/read").length,
		).toBe(3);
		expect(
			rpcCalls.some((body) => {
				if (body.method !== "tools/call") return false;
				const params =
					typeof body.params === "object" && body.params !== null
						? (body.params as Record<string, unknown>)
						: {};
				return params.name === "state_get";
			}),
		).toBe(false);
	});

	test("skips resources/read when includeState is false", async () => {
		const calls: RecordedCall[] = [];
		installFetchMock(calls);

		const request = new Request("http://localhost:3000/turns/resolve", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				action: "I rest at camp",
				includeState: false,
				autoTick: false,
			}),
		});
		const response = await handleResolveTurnRequest(
			request,
			createAuth(),
			false,
		);
		const payload = (await response.json()) as {
			success: boolean;
			state: unknown;
			resources: unknown;
		};

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.state).toBeNull();
		expect(payload.resources).toBeNull();

		const rpcCalls = calls
			.filter((call) => call.method === "POST" && call.body !== null)
			.map((call) => call.body as Record<string, unknown>);
		expect(
			rpcCalls.filter((body) => body.method === "resources/read").length,
		).toBe(0);
	});

	test("fails fast when player_action returns success=false", async () => {
		const calls: RecordedCall[] = [];
		installFetchMock(calls, {
			toolPayloads: {
				player_action: {
					success: false,
					message: "STRICT_CANONICAL_LEGACY_FALLBACK_BLOCKED",
				},
			},
		});

		const request = new Request("http://localhost:3000/turns/resolve", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				action: "I move to market",
				includeState: false,
				autoTick: false,
			}),
		});

		const response = await handleResolveTurnRequest(
			request,
			createAuth(),
			false,
		);
		const payload = (await response.json()) as {
			success: boolean;
			error: string;
		};

		expect(response.status).toBe(502);
		expect(payload.success).toBe(false);
		expect(payload.error).toContain("player_action failed");
		expect(payload.error).toContain("STRICT_CANONICAL_LEGACY_FALLBACK_BLOCKED");
	});

	test("fails fast when world_sync returns success=false", async () => {
		const calls: RecordedCall[] = [];
		installFetchMock(calls, {
			toolPayloads: {
				world_sync: {
					success: false,
					message: "World sync policy violation",
				},
			},
		});

		const request = new Request("http://localhost:3000/turns/resolve", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				action: "I travel to the square.",
				transcript: "The square appears.",
				syncWorld: true,
				autoTick: false,
				includeState: false,
			}),
		});

		const response = await handleResolveTurnRequest(
			request,
			createAuth(),
			false,
		);
		const payload = (await response.json()) as {
			success: boolean;
			error: string;
		};
		expect(response.status).toBe(502);
		expect(payload.success).toBe(false);
		expect(payload.error).toContain("world_sync failed");
		expect(payload.error).toContain("World sync policy violation");
	});

	test("fails fast when simulation_tick returns success=false", async () => {
		const calls: RecordedCall[] = [];
		installFetchMock(calls, {
			toolPayloads: {
				simulation_tick: {
					success: false,
					message: "Tick blocked by runtime policy",
				},
			},
		});

		const request = new Request("http://localhost:3000/turns/resolve", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				action: "I wait and observe.",
				autoTick: true,
				includeState: false,
			}),
		});

		const response = await handleResolveTurnRequest(
			request,
			createAuth(),
			false,
		);
		const payload = (await response.json()) as {
			success: boolean;
			error: string;
		};
		expect(response.status).toBe(502);
		expect(payload.success).toBe(false);
		expect(payload.error).toContain("simulation_tick failed");
		expect(payload.error).toContain("Tick blocked by runtime policy");
	});

	test("auto-recovers strict canonical reads in in-process orchestrator flow when guided setup is disabled", async () => {
		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		const previousGuidedSetup = Bun.env.BARDO_GUIDED_SETUP_ENABLED;
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-turn-orch-strict-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await mkdir(path.join(bardoRoot, "state"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{
					title: "Campaign State",
					description: "Legacy state only",
				},
				JSON.stringify({ currentLocation: "legacy-town" }, null, 2),
			),
			"utf8",
		);
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "true";
		Bun.env.BARDO_GUIDED_SETUP_ENABLED = "false";

		try {
			installInProcessMcpFetch({ auth: createAuth(root) });
			const request = new Request("http://localhost:3000/turns/resolve", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action: "I inspect the square.",
					includeState: false,
					autoTick: false,
				}),
			});

			const response = await handleResolveTurnRequest(
				request,
				createAuth(root),
				false,
			);
			const payload = (await response.json()) as {
				success: boolean;
				action: {
					result?: {
						requiresSetup?: boolean;
						setupStatus?: string;
					};
				} | null;
				consistency: { success?: boolean; errorCount?: number } | null;
				state: unknown;
				resources: unknown;
			};

			expect(response.status).toBe(200);
			expect(payload.success).toBe(true);
			expect(payload.action?.result?.requiresSetup).toBe(false);
			expect(payload.action?.result?.setupStatus).toBe("complete");
			expect(payload.consistency?.success).toBe(true);
			expect(payload.consistency?.errorCount).toBe(0);
			expect(payload.state).toBeNull();
			expect(payload.resources).toBeNull();
		} finally {
			if (previousStrict === undefined) {
				delete Bun.env.BARDO_STRICT_CANONICAL_MODE;
			} else {
				Bun.env.BARDO_STRICT_CANONICAL_MODE = previousStrict;
			}
			if (previousGuidedSetup === undefined) {
				delete Bun.env.BARDO_GUIDED_SETUP_ENABLED;
			} else {
				Bun.env.BARDO_GUIDED_SETUP_ENABLED = previousGuidedSetup;
			}
			await rm(root, { recursive: true, force: true });
		}
	});

	test("runs full strict-mode orchestrator flow with world sync and auto tick", async () => {
		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		const previousGuidedSetup = Bun.env.BARDO_GUIDED_SETUP_ENABLED;
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-turn-orch-strict-success-"),
		);
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "true";
		Bun.env.BARDO_GUIDED_SETUP_ENABLED = "false";

		try {
			installInProcessMcpFetch({ auth: createAuth(root) });
			const request = new Request("http://localhost:3000/turns/resolve", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action: "I scout the nearby plaza.",
					transcript: 'A guard named "Mira" stands in Bell Plaza.',
					syncWorld: true,
					autoTick: true,
					includeState: true,
				}),
			});

			const response = await handleResolveTurnRequest(
				request,
				createAuth(root),
				false,
			);
			const payload = (await response.json()) as {
				success: boolean;
				worldSync: { success?: boolean } | null;
				tick: { success?: boolean } | null;
				state: { stateSource?: string } | null;
				resources: { campaignSummary?: { stateSource?: string } } | null;
			};

			expect(response.status).toBe(200);
			expect(payload.success).toBe(true);
			expect(payload.worldSync?.success).toBe(true);
			expect(payload.tick?.success).toBe(true);
			expect(payload.state?.stateSource).toBe("projection");
			expect(payload.resources?.campaignSummary?.stateSource).toBe(
				"projection",
			);
		} finally {
			if (previousStrict === undefined) {
				delete Bun.env.BARDO_STRICT_CANONICAL_MODE;
			} else {
				Bun.env.BARDO_STRICT_CANONICAL_MODE = previousStrict;
			}
			if (previousGuidedSetup === undefined) {
				delete Bun.env.BARDO_GUIDED_SETUP_ENABLED;
			} else {
				Bun.env.BARDO_GUIDED_SETUP_ENABLED = previousGuidedSetup;
			}
			await rm(root, { recursive: true, force: true });
		}
	});
});
