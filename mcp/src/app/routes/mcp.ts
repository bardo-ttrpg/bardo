import {
	type LoopDetectionPolicy,
	validateLoopDetectionPolicy,
} from "../../domain/config/loop-detection";
import {
	isToolAllowed,
	resolveEffectiveToolPolicy,
	type ToolPolicyConfig,
} from "../../domain/config/tool-policy";
import type { SessionRegistry } from "../../session/session-registry";
import type { SessionStore } from "../../session/session-store";
import { createAndHandleSessionRequest } from "../../session/transport-lifecycle";
import { recordJsonRpcMetric, recordToolCallMetric } from "../../telemetry";
import type { AuthContext } from "../../types/contracts";
import { corsHeaders, jsonRpcError, withCors } from "../middleware/cors";

type JsonRpcMetadata = {
	method: string;
	toolName: string | null;
	toolArgsHash: string | null;
};

function stableSerialize(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
	}

	const record = value as Record<string, unknown>;
	const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
	return `{${keys
		.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
		.join(",")}}`;
}

function hashText(input: string): string {
	let hash = 2166136261;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index) ?? 0;
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseJsonRpcMetadata(payload: unknown): JsonRpcMetadata {
	if (Array.isArray(payload)) {
		return {
			method: "batch",
			toolName: null,
			toolArgsHash: null,
		};
	}

	if (typeof payload !== "object" || payload === null) {
		return {
			method: "unknown",
			toolName: null,
			toolArgsHash: null,
		};
	}

	const methodValue =
		typeof (payload as { method?: unknown }).method === "string"
			? (payload as { method: string }).method
			: "unknown";

	let toolName: string | null = null;
	let toolArgsHash: string | null = null;
	if (methodValue === "tools/call") {
		const params = (payload as { params?: unknown }).params;
		if (typeof params === "object" && params !== null) {
			const paramsRecord = params as { name?: unknown; arguments?: unknown };
			if (
				typeof paramsRecord.name === "string" &&
				paramsRecord.name.trim().length > 0
			) {
				toolName = paramsRecord.name.trim();
			}
			if (paramsRecord.arguments !== undefined) {
				toolArgsHash = hashText(stableSerialize(paramsRecord.arguments));
			} else {
				toolArgsHash = hashText("{}");
			}
		}
	}

	return {
		method: methodValue,
		toolName,
		toolArgsHash,
	};
}

async function readJsonRpcMetadata(request: Request): Promise<JsonRpcMetadata> {
	try {
		const payload = await request.clone().json();
		return parseJsonRpcMetadata(payload);
	} catch {
		return {
			method: "unknown",
			toolName: null,
			toolArgsHash: null,
		};
	}
}

function readHeaderValue(request: Request, name: string): string | null {
	const value = request.headers.get(name)?.trim();
	return value && value.length > 0 ? value : null;
}

async function handleMcpPost(
	request: Request,
	auth: AuthContext,
	sessionStore: SessionStore,
	sessionRegistry: SessionRegistry,
	toolPolicy: ToolPolicyConfig,
	loopPolicy: LoopDetectionPolicy,
	telemetryEnabled: boolean,
): Promise<Response> {
	const metadata = await readJsonRpcMetadata(request);
	const startedAt = performance.now();
	const recordMetrics = (status: "success" | "error") => {
		if (!telemetryEnabled) {
			return;
		}
		const durationMs = performance.now() - startedAt;
		recordJsonRpcMetric({
			method: metadata.method,
			status,
			durationMs,
		});
		if (metadata.toolName) {
			recordToolCallMetric({
				tool: metadata.toolName,
				status,
				durationMs,
			});
		}
	};

	try {
		const existingSessionId = request.headers.get("mcp-session-id");
		if (existingSessionId) {
			const existing = sessionStore.get(existingSessionId);
			if (!existing) {
				recordMetrics("error");
				return jsonRpcError(404, -32000, "Session not found");
			}
			sessionStore.touch(existingSessionId);
			sessionRegistry.touchSession(existingSessionId);
			sessionRegistry.recordJsonRpc({
				sessionId: existingSessionId,
				method: metadata.method,
				toolName: metadata.toolName,
			});

			if (metadata.toolName) {
				const providerId = readHeaderValue(request, "x-provider-id");
				const modelId = readHeaderValue(request, "x-model-id");
				const resolvedPolicy = resolveEffectiveToolPolicy(toolPolicy, {
					providerId,
					modelId,
				});
				if (!isToolAllowed(resolvedPolicy, metadata.toolName)) {
					recordMetrics("error");
					sessionRegistry.recordToolOutcome({
						sessionId: existingSessionId,
						toolName: metadata.toolName,
						status: "error",
					});
					return jsonRpcError(
						403,
						-32020,
						`Tool '${metadata.toolName}' is not allowed for the active tool policy (profile: ${resolvedPolicy.profile}${resolvedPolicy.providerRuleKey ? `, rule: ${resolvedPolicy.providerRuleKey}` : ""}).`,
					);
				}

				if (loopPolicy.enabled) {
					const loopResult = sessionRegistry.recordToolCallAndCheckLoop({
						sessionId: existingSessionId,
						toolName: metadata.toolName,
						argsHash: metadata.toolArgsHash ?? hashText("{}"),
					});
					if (loopResult.blocked) {
						recordMetrics("error");
						sessionRegistry.recordToolOutcome({
							sessionId: existingSessionId,
							toolName: metadata.toolName,
							status: "error",
						});
						return jsonRpcError(
							429,
							-32030,
							loopResult.reason ?? "Tool loop protection blocked this request.",
						);
					}
				}
			}

			const response = withCors(
				await existing.transport.handleRequest(request),
			);
			recordMetrics(response.ok ? "success" : "error");
			if (metadata.toolName) {
				sessionRegistry.recordToolOutcome({
					sessionId: existingSessionId,
					toolName: metadata.toolName,
					status: response.ok ? "success" : "error",
				});
			}
			return response;
		}

		const response = withCors(
			await createAndHandleSessionRequest(
				request,
				auth,
				sessionStore,
				sessionRegistry,
			),
		);
		recordMetrics(response.ok ? "success" : "error");
		const newSessionId = response.headers.get("mcp-session-id");
		if (newSessionId) {
			sessionRegistry.recordJsonRpc({
				sessionId: newSessionId,
				method: metadata.method,
				toolName: metadata.toolName,
			});
		}
		return response;
	} catch (error) {
		recordMetrics("error");
		throw error;
	}
}

async function handleMcpGetOrDelete(
	request: Request,
	sessionStore: SessionStore,
	sessionRegistry: SessionRegistry,
): Promise<Response> {
	const sessionId = request.headers.get("mcp-session-id");
	if (!sessionId) {
		return jsonRpcError(400, -32000, "Missing mcp-session-id header");
	}

	const existing = sessionStore.get(sessionId);
	if (!existing) {
		return jsonRpcError(404, -32000, "Session not found");
	}
	sessionStore.touch(sessionId);
	sessionRegistry.touchSession(sessionId);

	return withCors(await existing.transport.handleRequest(request));
}

export async function handleMcpRequest(
	request: Request,
	auth: AuthContext,
	sessionStore: SessionStore,
	sessionRegistry: SessionRegistry,
	toolPolicy: ToolPolicyConfig,
	loopPolicy: LoopDetectionPolicy,
	telemetryEnabled = true,
): Promise<Response> {
	validateLoopDetectionPolicy(loopPolicy);

	if (request.method === "POST") {
		return handleMcpPost(
			request,
			auth,
			sessionStore,
			sessionRegistry,
			toolPolicy,
			loopPolicy,
			telemetryEnabled,
		);
	}

	if (request.method === "GET" || request.method === "DELETE") {
		return handleMcpGetOrDelete(request, sessionStore, sessionRegistry);
	}

	return new Response("Method Not Allowed", {
		status: 405,
		headers: {
			allow: "GET, POST, DELETE, OPTIONS",
			...corsHeaders(),
		},
	});
}
