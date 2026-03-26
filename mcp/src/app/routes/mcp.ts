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
import { type JsonRpcMetadata, readJsonRpcMetadata } from "../jsonrpc-metadata";
import { corsHeaders, jsonRpcError, withCors } from "../middleware/cors";

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
	return parseBooleanFlag(Bun.env.BARDO_SETUP_CONTRACT_V2_REQUIRED, true);
}

function buildSetupContractRequiredResponse(toolName: string): Response {
	return jsonRpcError(
		428,
		-32031,
		`Tool '${toolName}' requires setup contract v2. Send x-bardo-setup-contract-version: 2.0.`,
	);
}

function requiresSetupContractV2(toolName: string): boolean {
	return (
		toolName === "init" ||
		toolName === "player_action" ||
		toolName === "scene_turn"
	);
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
	metadata: JsonRpcMetadata | null = null,
): Promise<Response> {
	const jsonRpcMetadata = metadata ?? (await readJsonRpcMetadata(request));
	const startedAt = performance.now();
	const recordMetrics = (status: "success" | "error") => {
		if (!telemetryEnabled) {
			return;
		}
		const durationMs = performance.now() - startedAt;
		recordJsonRpcMetric({
			method: jsonRpcMetadata.method,
			status,
			durationMs,
		});
		if (jsonRpcMetadata.toolCalls.length > 0) {
			for (const toolCall of jsonRpcMetadata.toolCalls) {
				recordToolCallMetric({
					tool: toolCall.toolName,
					status,
					durationMs,
				});
			}
		} else if (jsonRpcMetadata.toolName) {
			recordToolCallMetric({
				tool: jsonRpcMetadata.toolName,
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
				method: jsonRpcMetadata.method,
				toolName: jsonRpcMetadata.toolName,
			});

			if (jsonRpcMetadata.toolCalls.length > 0) {
				if (
					isStrictSetupContractEnforced() &&
					!hasSetupContractV2Header(request)
				) {
					for (const toolCall of jsonRpcMetadata.toolCalls) {
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
				for (const toolCall of jsonRpcMetadata.toolCalls) {
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
			if (jsonRpcMetadata.toolCalls.length > 0) {
				for (const toolCall of jsonRpcMetadata.toolCalls) {
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
				method: jsonRpcMetadata.method,
				toolName: jsonRpcMetadata.toolName,
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
	metadata: JsonRpcMetadata | null = null,
): Promise<Response> {
	const jsonRpcMetadata = metadata ?? (await readJsonRpcMetadata(request));
	const startedAt = performance.now();
	const recordMetrics = (status: "success" | "error") => {
		if (!telemetryEnabled) {
			return;
		}
		const durationMs = performance.now() - startedAt;
		recordJsonRpcMetric({
			method: jsonRpcMetadata.method,
			status,
			durationMs,
		});
		if (jsonRpcMetadata.toolCalls.length > 0) {
			for (const toolCall of jsonRpcMetadata.toolCalls) {
				recordToolCallMetric({
					tool: toolCall.toolName,
					status,
					durationMs,
				});
			}
		} else if (jsonRpcMetadata.toolName) {
			recordToolCallMetric({
				tool: jsonRpcMetadata.toolName,
				status,
				durationMs,
			});
		}
	};

	try {
		if (jsonRpcMetadata.toolCalls.length > 0) {
			if (
				isStrictSetupContractEnforced() &&
				!hasSetupContractV2Header(request)
			) {
				for (const toolCall of jsonRpcMetadata.toolCalls) {
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
			for (const toolCall of jsonRpcMetadata.toolCalls) {
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
		metadata?: JsonRpcMetadata | null;
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
			options.metadata ?? null,
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
			options.metadata ?? null,
		);
	}

	if (request.method === "GET" || request.method === "DELETE") {
		return handleMcpGetOrDelete(request, sessionStore, sessionRegistry);
	}

	return methodNotAllowedResponse("GET, POST, DELETE, OPTIONS");
}
