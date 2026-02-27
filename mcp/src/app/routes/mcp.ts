import {
	type LoopDetectionPolicy,
	validateLoopDetectionPolicy,
} from "../../domain/config/loop-detection";
import type { McpTransportMode } from "../../domain/config/security";
import {
	isToolAllowed,
	resolveEffectiveToolPolicy,
	type ToolPolicyConfig,
} from "../../domain/config/tool-policy";
import type { SessionRegistry } from "../../session/session-registry";
import type { SessionStore } from "../../session/session-store";
import {
	createAndHandleSessionRequest,
	createAndHandleStatelessRequest,
} from "../../session/transport-lifecycle";
import { recordJsonRpcMetric, recordToolCallMetric } from "../../telemetry";
import type { AuthContext } from "../../types/contracts";
import { corsHeaders, jsonRpcError, withCors } from "../middleware/cors";

type JsonRpcMetadata = {
	method: string;
	toolName: string | null;
	toolArgsHash: string | null;
	toolCalls: Array<{
		toolName: string;
		toolArgsHash: string;
	}>;
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

function parseToolCallMetadata(payload: unknown): {
	toolName: string;
	toolArgsHash: string;
} | null {
	if (typeof payload !== "object" || payload === null) {
		return null;
	}
	const methodValue =
		typeof (payload as { method?: unknown }).method === "string"
			? (payload as { method: string }).method
			: "unknown";
	if (methodValue !== "tools/call") {
		return null;
	}
	const params = (payload as { params?: unknown }).params;
	if (typeof params !== "object" || params === null) {
		return null;
	}
	const paramsRecord = params as { name?: unknown; arguments?: unknown };
	if (
		typeof paramsRecord.name !== "string" ||
		paramsRecord.name.trim().length < 1
	) {
		return null;
	}
	return {
		toolName: paramsRecord.name.trim(),
		toolArgsHash:
			paramsRecord.arguments !== undefined
				? hashText(stableSerialize(paramsRecord.arguments))
				: hashText("{}"),
	};
}

function parseJsonRpcMetadata(payload: unknown): JsonRpcMetadata {
	if (Array.isArray(payload)) {
		const toolCalls = payload
			.map((item) => parseToolCallMetadata(item))
			.filter(
				(value): value is { toolName: string; toolArgsHash: string } =>
					value !== null,
			);
		return {
			method: "batch",
			toolName: null,
			toolArgsHash: null,
			toolCalls,
		};
	}

	if (typeof payload !== "object" || payload === null) {
		return {
			method: "unknown",
			toolName: null,
			toolArgsHash: null,
			toolCalls: [],
		};
	}

	const methodValue =
		typeof (payload as { method?: unknown }).method === "string"
			? (payload as { method: string }).method
			: "unknown";
	const toolCall = parseToolCallMetadata(payload);

	return {
		method: methodValue,
		toolName: toolCall?.toolName ?? null,
		toolArgsHash: toolCall?.toolArgsHash ?? null,
		toolCalls: toolCall ? [toolCall] : [],
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
			toolCalls: [],
		};
	}
}

function readHeaderValue(request: Request, name: string): string | null {
	const value = request.headers.get(name)?.trim();
	return value && value.length > 0 ? value : null;
}

function methodNotAllowedResponse(allow: string): Response {
	return new Response("Method Not Allowed", {
		status: 405,
		headers: {
			allow,
			...corsHeaders(),
		},
	});
}

function buildPolicyBlockedResponse(
	toolName: string,
	resolvedProfile: string,
	resolvedProviderRuleKey: string | null,
): Response {
	return jsonRpcError(
		403,
		-32020,
		`Tool '${toolName}' is not allowed for the active tool policy (profile: ${resolvedProfile}${resolvedProviderRuleKey ? `, rule: ${resolvedProviderRuleKey}` : ""}).`,
	);
}

function parseBooleanFlag(
	value: string | undefined,
	fallback: boolean,
): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return fallback;
}

function isStrictSetupContractEnforced(): boolean {
	return parseBooleanFlag(Bun.env.BARDO_SETUP_CONTRACT_V2_REQUIRED, false);
}

function buildSetupContractRequiredResponse(toolName: string): Response {
	return jsonRpcError(
		428,
		-32031,
		`Tool '${toolName}' requires setup contract v2. Send x-bardo-setup-contract-version: 2.0.`,
	);
}

function requiresSetupContractV2(toolName: string): boolean {
	return toolName === "init" || toolName === "player_action";
}

function hasSetupContractV2Header(request: Request): boolean {
	const header = request.headers.get("x-bardo-setup-contract-version")?.trim();
	return header === "2.0";
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
		if (metadata.toolCalls.length > 0) {
			for (const toolCall of metadata.toolCalls) {
				recordToolCallMetric({
					tool: toolCall.toolName,
					status,
					durationMs,
				});
			}
		} else if (metadata.toolName) {
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

			if (metadata.toolCalls.length > 0) {
				if (
					isStrictSetupContractEnforced() &&
					!hasSetupContractV2Header(request)
				) {
					for (const toolCall of metadata.toolCalls) {
						if (requiresSetupContractV2(toolCall.toolName)) {
							recordMetrics("error");
							return buildSetupContractRequiredResponse(toolCall.toolName);
						}
					}
				}
				const providerId = readHeaderValue(request, "x-provider-id");
				const modelId = readHeaderValue(request, "x-model-id");
				const resolvedPolicy = resolveEffectiveToolPolicy(toolPolicy, {
					providerId,
					modelId,
				});
				for (const toolCall of metadata.toolCalls) {
					if (!isToolAllowed(resolvedPolicy, toolCall.toolName)) {
						recordMetrics("error");
						sessionRegistry.recordToolOutcome({
							sessionId: existingSessionId,
							toolName: toolCall.toolName,
							status: "error",
						});
						return buildPolicyBlockedResponse(
							toolCall.toolName,
							resolvedPolicy.profile,
							resolvedPolicy.providerRuleKey ?? null,
						);
					}

					if (loopPolicy.enabled) {
						const loopResult = sessionRegistry.recordToolCallAndCheckLoop({
							sessionId: existingSessionId,
							toolName: toolCall.toolName,
							argsHash: toolCall.toolArgsHash,
						});
						if (loopResult.blocked) {
							recordMetrics("error");
							sessionRegistry.recordToolOutcome({
								sessionId: existingSessionId,
								toolName: toolCall.toolName,
								status: "error",
							});
							return jsonRpcError(
								429,
								-32030,
								loopResult.reason ??
									"Tool loop protection blocked this request.",
							);
						}
					}
				}
			}

			const response = withCors(
				await existing.transport.handleRequest(request),
			);
			recordMetrics(response.ok ? "success" : "error");
			if (metadata.toolCalls.length > 0) {
				for (const toolCall of metadata.toolCalls) {
					sessionRegistry.recordToolOutcome({
						sessionId: existingSessionId,
						toolName: toolCall.toolName,
						status: response.ok ? "success" : "error",
					});
				}
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

async function handleMcpPostStateless(
	request: Request,
	auth: AuthContext,
	toolPolicy: ToolPolicyConfig,
	telemetryEnabled: boolean,
	enableJsonResponse: boolean,
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
		if (metadata.toolCalls.length > 0) {
			for (const toolCall of metadata.toolCalls) {
				recordToolCallMetric({
					tool: toolCall.toolName,
					status,
					durationMs,
				});
			}
		} else if (metadata.toolName) {
			recordToolCallMetric({
				tool: metadata.toolName,
				status,
				durationMs,
			});
		}
	};

	try {
		if (metadata.toolCalls.length > 0) {
			if (
				isStrictSetupContractEnforced() &&
				!hasSetupContractV2Header(request)
			) {
				for (const toolCall of metadata.toolCalls) {
					if (requiresSetupContractV2(toolCall.toolName)) {
						recordMetrics("error");
						return buildSetupContractRequiredResponse(toolCall.toolName);
					}
				}
			}
			const providerId = readHeaderValue(request, "x-provider-id");
			const modelId = readHeaderValue(request, "x-model-id");
			const resolvedPolicy = resolveEffectiveToolPolicy(toolPolicy, {
				providerId,
				modelId,
			});
			for (const toolCall of metadata.toolCalls) {
				if (!isToolAllowed(resolvedPolicy, toolCall.toolName)) {
					recordMetrics("error");
					return buildPolicyBlockedResponse(
						toolCall.toolName,
						resolvedPolicy.profile,
						resolvedPolicy.providerRuleKey ?? null,
					);
				}
			}
		}

		const response = withCors(
			await createAndHandleStatelessRequest(request, auth, {
				enableJsonResponse,
			}),
		);
		recordMetrics(response.ok ? "success" : "error");
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
	options: {
		transportMode?: McpTransportMode;
		enableJsonResponse?: boolean;
	} = {},
): Promise<Response> {
	validateLoopDetectionPolicy(loopPolicy);
	const transportMode = options.transportMode ?? "stateful";

	if (transportMode === "stateless") {
		if (request.method !== "POST") {
			return methodNotAllowedResponse("POST, OPTIONS");
		}
		return handleMcpPostStateless(
			request,
			auth,
			toolPolicy,
			telemetryEnabled,
			options.enableJsonResponse ?? true,
		);
	}

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

	return methodNotAllowedResponse("GET, POST, DELETE, OPTIONS");
}
