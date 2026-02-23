import { recordOrchestratorWorkflowMetric } from "../../telemetry";
import type { AuthContext } from "../../types/contracts";
import {
	buildJsonResponse,
	callMcpJsonRpc,
	closeSession,
	isRecord,
	parseResolveTurnPayload,
	parseSseJsonEvents,
	type ResolveTurnPayload,
	readToolPayload,
	runOrchestratorStep,
} from "./turns-orchestrator-internal";

export { parseResolveTurnPayload, parseSseJsonEvents };

function readPromptResult(lastEvent: unknown): unknown {
	if (!isRecord(lastEvent) || !isRecord(lastEvent.result)) {
		return null;
	}
	return lastEvent.result;
}

function readResourceResult(lastEvent: unknown): unknown {
	if (!isRecord(lastEvent) || !isRecord(lastEvent.result)) {
		return null;
	}

	const result = lastEvent.result;
	const contents = result.contents;
	if (!Array.isArray(contents)) {
		return result;
	}

	for (const item of contents) {
		if (!isRecord(item) || typeof item.text !== "string") {
			continue;
		}
		try {
			return JSON.parse(item.text);
		} catch {
			return item.text;
		}
	}

	return result;
}

function getToolFailure(step: string, result: unknown): string | null {
	if (!isRecord(result)) {
		return null;
	}
	if (result.success !== false) {
		return null;
	}
	const detail =
		typeof result.message === "string" && result.message.trim().length > 0
			? result.message.trim()
			: "tool returned success=false";
	return `${step} failed: ${detail}`;
}

function summarizeToolFailurePayload(result: unknown): string {
	if (isRecord(result) && typeof result.message === "string") {
		const message = result.message.trim();
		if (message.length > 0) {
			return message;
		}
	}
	if (typeof result === "string" && result.trim().length > 0) {
		return result.trim();
	}
	return "tool execution failed";
}

function assertToolSuccess(args: {
	step: string;
	toolRpcResult: Record<string, unknown> | null;
	result: unknown;
}): void {
	const failure = getToolFailure(args.step, args.result);
	if (failure) {
		throw new Error(failure);
	}
	if (args.toolRpcResult?.isError === true) {
		throw new Error(
			`${args.step} failed: ${summarizeToolFailurePayload(args.result)}`,
		);
	}
}

export async function handleResolveTurnRequest(
	request: Request,
	auth: AuthContext,
	telemetryEnabled = true,
): Promise<Response> {
	let payload: ResolveTurnPayload;
	try {
		const raw = await request.json();
		payload = parseResolveTurnPayload(raw);
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Invalid request body. Expected JSON payload.";
		return buildJsonResponse(400, {
			success: false,
			error: message,
		});
	}

	const workflowId = crypto.randomUUID();
	const workflow = "turns_resolve";
	let sessionId: string | null = null;

	try {
		const initialize = await runOrchestratorStep({
			workflow,
			step: "initialize",
			telemetryEnabled,
			fn: () =>
				callMcpJsonRpc({
					request,
					auth,
					body: {
						jsonrpc: "2.0",
						id: 1,
						method: "initialize",
						params: {
							protocolVersion: "2025-03-26",
							capabilities: {},
							clientInfo: {
								name: "bardo-turns-orchestrator",
								version: "1.0.0",
							},
						},
					},
				}),
		});

		sessionId = initialize.sessionId;
		if (!sessionId) {
			throw new Error(
				"MCP session initialization failed (missing session id).",
			);
		}
		const activeSessionId = sessionId;

		await runOrchestratorStep({
			workflow,
			step: "initialized_notification",
			telemetryEnabled,
			fn: () =>
				callMcpJsonRpc({
					request,
					auth,
					sessionId: activeSessionId,
					body: {
						jsonrpc: "2.0",
						method: "notifications/initialized",
					},
				}),
		});

		const contextCall = await runOrchestratorStep({
			workflow,
			step: "context_query",
			telemetryEnabled,
			fn: () =>
				callMcpJsonRpc({
					request,
					auth,
					sessionId: activeSessionId,
					body: {
						jsonrpc: "2.0",
						id: 2,
						method: "tools/call",
						params: {
							name: "context_query",
							arguments: {
								query: payload.transcript
									? `${payload.action}\n${payload.transcript}`
									: payload.action,
								mode: payload.memoryProfile,
							},
						},
					},
				}),
		});

		const contextResult =
			isRecord(contextCall.lastEvent) && isRecord(contextCall.lastEvent.result)
				? readToolPayload(contextCall.lastEvent.result)
				: null;

		let workflowPrompt: unknown = null;
		try {
			const promptCall = await runOrchestratorStep({
				workflow,
				step: "resolve_player_action_prompt",
				telemetryEnabled,
				fn: () =>
					callMcpJsonRpc({
						request,
						auth,
						sessionId: activeSessionId,
						body: {
							jsonrpc: "2.0",
							id: 2.5,
							method: "prompts/get",
							params: {
								name: "resolve_player_action",
								arguments: {
									action: payload.action,
								},
							},
						},
					}),
			});
			workflowPrompt = readPromptResult(promptCall.lastEvent);
		} catch {
			workflowPrompt = null;
		}

		const actionCall = await runOrchestratorStep({
			workflow,
			step: "player_action",
			telemetryEnabled,
			fn: () =>
				callMcpJsonRpc({
					request,
					auth,
					sessionId: activeSessionId,
					body: {
						jsonrpc: "2.0",
						id: 3,
						method: "tools/call",
						params: {
							name: "player_action",
							arguments: {
								action: payload.action,
							},
						},
					},
				}),
		});

		const actionToolRpcResult =
			isRecord(actionCall.lastEvent) && isRecord(actionCall.lastEvent.result)
				? actionCall.lastEvent.result
				: null;
		const actionResult = actionToolRpcResult
			? readToolPayload(actionToolRpcResult)
			: null;
		assertToolSuccess({
			step: "player_action",
			toolRpcResult: actionToolRpcResult,
			result: actionResult,
		});

		if (
			isRecord(actionResult) &&
			actionResult.requiresSetup === true &&
			typeof actionResult.setupStatus === "string"
		) {
			if (telemetryEnabled) {
				recordOrchestratorWorkflowMetric({ workflow, status: "success" });
			}
			return buildJsonResponse(
				200,
				{
					success: true,
					workflowId,
					mode: "orchestrated-turn",
					status: "needs_input",
					action: {
						input: payload.action,
						result: actionResult,
					},
					context: contextResult,
					workflowPrompt,
					worldSync: null,
					tick: null,
					consistency: null,
					state: null,
					resources: null,
				},
				{
					"x-workflow-id": workflowId,
				},
			);
		}

		let worldSyncResult: unknown = null;
		if (payload.syncWorld && payload.transcript) {
			const syncCall = await runOrchestratorStep({
				workflow,
				step: "world_sync",
				telemetryEnabled,
				fn: () =>
					callMcpJsonRpc({
						request,
						auth,
						sessionId: activeSessionId,
						body: {
							jsonrpc: "2.0",
							id: 4,
							method: "tools/call",
							params: {
								name: "world_sync",
								arguments: {
									transcript: payload.transcript,
								},
							},
						},
					}),
			});

			const worldSyncToolRpcResult =
				isRecord(syncCall.lastEvent) && isRecord(syncCall.lastEvent.result)
					? syncCall.lastEvent.result
					: null;
			worldSyncResult = worldSyncToolRpcResult
				? readToolPayload(worldSyncToolRpcResult)
				: null;
			assertToolSuccess({
				step: "world_sync",
				toolRpcResult: worldSyncToolRpcResult,
				result: worldSyncResult,
			});
		}

		let tickResult: unknown = null;
		if (payload.autoTick) {
			const tickCall = await runOrchestratorStep({
				workflow,
				step: "simulation_tick",
				telemetryEnabled,
				fn: () =>
					callMcpJsonRpc({
						request,
						auth,
						sessionId: activeSessionId,
						body: {
							jsonrpc: "2.0",
							id: 5,
							method: "tools/call",
							params: {
								name: "simulation_tick",
								arguments: {
									mode: "turn",
									tickCount: 1,
									idempotencyKey: workflowId,
								},
							},
						},
					}),
			});

			const tickToolRpcResult =
				isRecord(tickCall.lastEvent) && isRecord(tickCall.lastEvent.result)
					? tickCall.lastEvent.result
					: null;
			tickResult = tickToolRpcResult
				? readToolPayload(tickToolRpcResult)
				: null;
			assertToolSuccess({
				step: "simulation_tick",
				toolRpcResult: tickToolRpcResult,
				result: tickResult,
			});
		}

		const consistencyCall = await runOrchestratorStep({
			workflow,
			step: "consistency_check",
			telemetryEnabled,
			fn: () =>
				callMcpJsonRpc({
					request,
					auth,
					sessionId: activeSessionId,
					body: {
						jsonrpc: "2.0",
						id: 7,
						method: "tools/call",
						params: {
							name: "consistency_check",
							arguments: {
								includeWarnings: false,
							},
						},
					},
				}),
		});

		const consistencyToolRpcResult =
			isRecord(consistencyCall.lastEvent) &&
			isRecord(consistencyCall.lastEvent.result)
				? consistencyCall.lastEvent.result
				: null;
		const consistencyResult = consistencyToolRpcResult
			? readToolPayload(consistencyToolRpcResult)
			: null;
		assertToolSuccess({
			step: "consistency_check",
			toolRpcResult: consistencyToolRpcResult,
			result: consistencyResult,
		});

		let stateResult: unknown = null;
		let resourcesResult: unknown = null;
		if (payload.includeState) {
			const campaignSummaryCall = await runOrchestratorStep({
				workflow,
				step: "resource_campaign_current_summary",
				telemetryEnabled,
				fn: () =>
					callMcpJsonRpc({
						request,
						auth,
						sessionId: activeSessionId,
						body: {
							jsonrpc: "2.0",
							id: 8,
							method: "resources/read",
							params: {
								uri: "resource://campaign/current-summary",
							},
						},
					}),
			});
			const sceneCurrentCall = await runOrchestratorStep({
				workflow,
				step: "resource_scene_current",
				telemetryEnabled,
				fn: () =>
					callMcpJsonRpc({
						request,
						auth,
						sessionId: activeSessionId,
						body: {
							jsonrpc: "2.0",
							id: 9,
							method: "resources/read",
							params: {
								uri: "resource://scene/current",
							},
						},
					}),
			});
			const recentDigestCall = await runOrchestratorStep({
				workflow,
				step: "resource_events_recent_digest",
				telemetryEnabled,
				fn: () =>
					callMcpJsonRpc({
						request,
						auth,
						sessionId: activeSessionId,
						body: {
							jsonrpc: "2.0",
							id: 10,
							method: "resources/read",
							params: {
								uri: "resource://events/recent-digest",
							},
						},
					}),
			});

			const campaignSummary = readResourceResult(campaignSummaryCall.lastEvent);
			const sceneCurrent = readResourceResult(sceneCurrentCall.lastEvent);
			const recentEvents = readResourceResult(recentDigestCall.lastEvent);
			stateResult = campaignSummary;
			resourcesResult = {
				campaignSummary,
				sceneCurrent,
				recentEvents,
			};
		}

		if (telemetryEnabled) {
			recordOrchestratorWorkflowMetric({ workflow, status: "success" });
		}
		return buildJsonResponse(
			200,
			{
				success: true,
				workflowId,
				mode: "orchestrated-turn",
				action: {
					input: payload.action,
					result: actionResult,
				},
				context: contextResult,
				workflowPrompt,
				worldSync: worldSyncResult,
				tick: tickResult,
				consistency: consistencyResult,
				state: stateResult,
				resources: resourcesResult,
			},
			{
				"x-workflow-id": workflowId,
			},
		);
	} catch (error) {
		if (telemetryEnabled) {
			recordOrchestratorWorkflowMetric({ workflow, status: "error" });
		}
		const message =
			error instanceof Error
				? error.message
				: "Failed to resolve orchestrated turn.";
		return buildJsonResponse(502, {
			success: false,
			workflowId,
			error: message,
		});
	} finally {
		if (sessionId) {
			try {
				await closeSession(request, auth, sessionId);
			} catch {
				// Ignore close errors. Session TTL cleanup still applies.
			}
		}
	}
}
