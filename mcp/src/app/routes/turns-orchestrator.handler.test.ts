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
						structuredContent: {
							success: true,
							results: [],
							factsFound: [],
							constraints: [],
							unknowns: [],
							confidence: {
								overall: "low",
								grounding: "underspecified",
							},
							recommendedNextSteps: [],
							riskFlags: [],
							writePlan: {
								status: "none",
								shouldWrite: false,
								targets: [],
							},
							provenance: [],
						},
					},
				});
			}
			if (name === "scene_turn") {
				return jsonRpcResponse({
					jsonrpc: "2.0",
					id: body.id ?? 1,
					result: {
						structuredContent: {
							success: true,
							message: "Scene resolved.",
							requiresSetup: false,
							setupStatus: "complete",
							setupQuestionKey: null,
							setupQuestion: null,
							setupWarnings: [],
							pendingAction: null,
							gmPacket: {
								sceneFrame: {
									locationId: "river-market",
									locationName: "River Market",
									summary: "A tense bazaar at dusk.",
									activeSituation: "The square watches the player closely.",
									exits: ["north", "south"],
									sensoryCues: ["river-mist"],
									unresolvedQuestions: [],
								},
								resolution: {
									intent: "general",
									fiction: "The action lands cleanly.",
									mechanicsSummary: "No additional mechanics needed.",
									outcome: "success",
								},
								narrativeBeats: ["The moment advances."],
								npcReactions: [],
								discoveries: [],
								consequences: {
									timeAdvancedMinutes: 5,
									worldTimeAfterISO: "2026-03-20T00:05:00.000Z",
									locationAfter: "river-market",
									clocksAdvanced: [],
									threadsActivated: [],
								},
								followUps: ["Describe the immediate consequence."],
								safetyNotes: [],
								renderingHints: {
									tone: "grounded",
									pacing: "steady",
									revealLevel: "minimal",
									rulesTransparency: "explicit",
								},
							},
							actionResult: {
								locationAfter: "river-market",
							},
							consistency: {
								success: true,
								errorCount: 0,
							},
							factsFound: [],
							constraints: [],
							unknowns: [],
							confidence: {
								overall: "high",
								grounding: "grounded_enough",
							},
							recommendedNextSteps: [],
							riskFlags: [],
							writePlan: {
								status: "already_applied",
								shouldWrite: true,
								targets: [],
							},
							provenance: [],
						},
					},
				});
			}
			if (name === "world_sync") {
				return jsonRpcResponse({
					jsonrpc: "2.0",
					id: body.id ?? 1,
					result: {
						structuredContent: {
							success: true,
							message: "World sync complete.",
							rootPath: "/tmp/bardo-tests/bardo",
							statePath: "/tmp/bardo-tests/bardo/state/current.md",
							historyPath: "/tmp/bardo-tests/bardo/state/history.md",
							extractedLocationNames: ["Bell Plaza"],
							extractedNpcNames: ["Mira"],
							createdLocationIds: [],
							createdNpcIds: [],
							existingLocationIds: ["bell-plaza"],
							existingNpcIds: ["mira"],
							currentLocationAfter: "river-market",
							persistedDiscoveries: [],
							optionalSystems: {
								clockTracking: true,
								npcGoals: true,
								factionReputation: false,
							},
						},
					},
				});
			}
			if (name === "simulation_tick") {
				return jsonRpcResponse({
					jsonrpc: "2.0",
					id: body.id ?? 1,
					result: {
						structuredContent: {
							success: true,
							message: "Tick applied.",
							rootPath: "/tmp/bardo-tests/bardo",
							mode: "turn",
							tickCount: 1,
							dryRun: false,
							idempotentReplay: false,
							statePath: "/tmp/bardo-tests/bardo/state/current.md",
							historyPath: "/tmp/bardo-tests/bardo/state/history.md",
							filesTouched: ["/tmp/bardo-tests/bardo/events/canonical.ndjson"],
							entitiesUpdated: 0,
							factionsUpdated: 0,
							eventsCreated: 1,
							stateVersion: "v1",
							worldTimeBeforeISO: "2026-03-20T00:05:00.000Z",
							worldTimeAfterISO: "2026-03-20T00:06:00.000Z",
						},
					},
				});
			}
			if (name === "world_state_overview") {
				return jsonRpcResponse({
					jsonrpc: "2.0",
					id: body.id ?? 1,
					result: {
						structuredContent: {
							success: true,
							reportType: "world_state_overview",
							rootPath: "/tmp/bardo-tests/bardo",
							filePath: "/tmp/bardo-tests/bardo/logs/world-state-overview.md",
							rawMarkdown:
								"# World State Overview\n\n## Canon\n- Current location: river-market",
							factsFound: [
								{
									summary: "Current location: river-market",
									source: "canonical",
								},
							],
							constraints: [],
							unknowns: [],
							confidence: {
								overall: "high",
								grounding: "grounded_enough",
							},
							recommendedNextSteps: [],
							riskFlags: [],
							writePlan: {
								status: "already_applied",
								shouldWrite: true,
								targets: [],
							},
							provenance: [],
						},
					},
				});
			}
			if (name === "timeline_diff" || name === "player_knowledge_view") {
				return jsonRpcResponse({
					jsonrpc: "2.0",
					id: body.id ?? 1,
					result: {
						structuredContent: {
							success: true,
							reportType: name,
							rootPath: "/tmp/bardo-tests/bardo",
							filePath: `/tmp/bardo-tests/bardo/logs/${name}.md`,
							rawMarkdown: `# ${name}\n\n## Canon\n- Stable report payload`,
							factsFound: [],
							constraints: [],
							unknowns: [],
							confidence: {
								overall: "medium",
								grounding: "grounded_enough",
							},
							recommendedNextSteps: [],
							riskFlags: [],
							writePlan: {
								status: "already_applied",
								shouldWrite: true,
								targets: [],
							},
							provenance: [],
						},
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
	test("uses the public six-tool workflow and does not call state_get", async () => {
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
			state: { reportType?: string } | null;
			resources: {
				worldStateOverview?: { reportType?: string };
				timelineDiff?: { reportType?: string };
			} | null;
		};

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.workflowPrompt).toBeNull();
		expect(payload.state?.reportType).toBe("world_state_overview");
		expect(payload.resources?.worldStateOverview?.reportType).toBe(
			"world_state_overview",
		);
		expect(payload.resources?.timelineDiff?.reportType).toBe("timeline_diff");

		const rpcCalls = calls
			.filter((call) => call.method === "POST" && call.body !== null)
			.map((call) => call.body as Record<string, unknown>);
		expect(
			rpcCalls.some((body) => {
				if (body.method !== "tools/call") return false;
				const params =
					typeof body.params === "object" && body.params !== null
						? (body.params as Record<string, unknown>)
						: {};
				return params.name === "scene_turn";
			}),
		).toBe(true);
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
			rpcCalls.some((body) => {
				if (body.method !== "tools/call") return false;
				const params =
					typeof body.params === "object" && body.params !== null
						? (body.params as Record<string, unknown>)
						: {};
				return (
					params.name === "world_state_overview" ||
					params.name === "timeline_diff" ||
					params.name === "player_knowledge_view"
				);
			}),
		).toBe(false);
	});

	test("passes skipWorldSync=true to scene_turn when syncWorld is disabled", async () => {
		const calls: RecordedCall[] = [];
		installFetchMock(calls);

		const request = new Request("http://localhost:3000/turns/resolve", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				action: "I watch the crowd without updating canon",
				transcript: "A stranger whispers from the arcade.",
				syncWorld: false,
				autoTick: false,
				includeState: false,
			}),
		});

		const response = await handleResolveTurnRequest(
			request,
			createAuth(),
			false,
		);

		expect(response.status).toBe(200);

		const sceneTurnCall = calls
			.filter(
				(call) => call.method === "POST" && call.body?.method === "tools/call",
			)
			.map((call) => call.body as Record<string, unknown>)
			.find((body) => {
				const params =
					typeof body.params === "object" && body.params !== null
						? (body.params as Record<string, unknown>)
						: {};
				return params.name === "scene_turn";
			});
		const sceneTurnArgs =
			sceneTurnCall &&
			typeof sceneTurnCall.params === "object" &&
			sceneTurnCall.params !== null
				? (sceneTurnCall.params as Record<string, unknown>).arguments
				: null;

		expect(sceneTurnArgs).toMatchObject({
			skipWorldSync: true,
		});
		expect(
			calls.some((call) => {
				if (call.method !== "POST" || call.body?.method !== "tools/call") {
					return false;
				}
				const params =
					typeof call.body.params === "object" && call.body.params !== null
						? (call.body.params as Record<string, unknown>)
						: {};
				return params.name === "world_sync";
			}),
		).toBe(false);
	});

	test("fails fast when scene_turn returns success=false", async () => {
		const calls: RecordedCall[] = [];
		installFetchMock(calls, {
			toolPayloads: {
				scene_turn: {
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
		expect(payload.error).toContain("scene_turn failed");
		expect(payload.error).toContain("STRICT_CANONICAL_LEGACY_FALLBACK_BLOCKED");
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
				worldSync: {
					success?: boolean;
				} | null;
				tick: {
					success?: boolean;
					mode?: string;
				} | null;
				state: { reportType?: string } | null;
				resources: {
					worldStateOverview?: { reportType?: string };
					playerKnowledge?: { reportType?: string };
				} | null;
			};

			expect(response.status).toBe(200);
			expect(payload.success).toBe(true);
			expect(payload.worldSync?.success).toBe(true);
			expect(payload.tick?.success).toBe(true);
			expect(payload.tick?.mode).toBe("turn");
			expect(payload.state?.reportType).toBe("world_state_overview");
			expect(payload.resources?.worldStateOverview?.reportType).toBe(
				"world_state_overview",
			);
			expect(payload.resources?.playerKnowledge?.reportType).toBe(
				"player_knowledge_view",
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

	test("serializes concurrent strict-mode turn workflows against one workspace", async () => {
		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		const previousGuidedSetup = Bun.env.BARDO_GUIDED_SETUP_ENABLED;
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-turn-orch-concurrent-"),
		);
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "true";
		Bun.env.BARDO_GUIDED_SETUP_ENABLED = "false";

		try {
			installInProcessMcpFetch({ auth: createAuth(root) });

			const warmupRequest = new Request("http://localhost:3000/turns/resolve", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action: "I scout the square.",
					autoTick: true,
					includeState: false,
				}),
			});
			const warmupResponse = await handleResolveTurnRequest(
				warmupRequest,
				createAuth(root),
				false,
			);
			expect(warmupResponse.status).toBe(200);

			const responses = await Promise.all(
				Array.from({ length: 5 }, (_, index) =>
					handleResolveTurnRequest(
						new Request("http://localhost:3000/turns/resolve", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({
								action: `I inspect clue ${index + 1}.`,
								autoTick: true,
								includeState: false,
							}),
						}),
						createAuth(root),
						false,
					),
				),
			);
			const payloads = await Promise.all(
				responses.map(async (response) => ({
					status: response.status,
					body: (await response.json()) as {
						success?: boolean;
						error?: string;
					},
				})),
			);

			expect(payloads.every((entry) => entry.status === 200)).toBe(true);
			expect(
				payloads.every(
					(entry) =>
						entry.body.success === true &&
						!entry.body.error?.includes("STRICT_CANONICAL_STALE_PROJECTION"),
				),
			).toBe(true);
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
