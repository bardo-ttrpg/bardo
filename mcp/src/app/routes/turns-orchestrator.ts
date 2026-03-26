import { runSimulationTick } from "../../mcp/tools/simulation-tick";
import { runWorldSync } from "../../mcp/tools/world-sync/register";
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

		const sceneTurnCall = await runOrchestratorStep({
			workflow,
			step: "scene_turn",
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
							name: "scene_turn",
							arguments: {
								action: payload.action,
								...(payload.transcript
									? { transcript: payload.transcript }
									: {}),
								idempotencyKey: workflowId,
								skipWorldSync: !payload.syncWorld,
							},
						},
					},
				}),
		});

		const actionToolRpcResult =
			isRecord(sceneTurnCall.lastEvent) &&
			isRecord(sceneTurnCall.lastEvent.result)
				? sceneTurnCall.lastEvent.result
				: null;
		const actionResult = actionToolRpcResult
			? readToolPayload(actionToolRpcResult)
			: null;
		assertToolSuccess({
			step: "scene_turn",
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
					workflowPrompt: null,
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

		const consistencyResult =
			isRecord(actionResult) && isRecord(actionResult.consistency)
				? actionResult.consistency
				: null;
		let worldSyncResult: unknown = null;
		if (payload.syncWorld) {
			worldSyncResult = await runOrchestratorStep({
				workflow,
				step: "world_sync",
				telemetryEnabled,
				fn: () =>
					runWorldSync({
						auth,
						...(payload.transcript ? { transcript: payload.transcript } : {}),
						...(isRecord(actionResult) &&
						isRecord(actionResult.actionResult) &&
						typeof actionResult.actionResult.locationAfter === "string"
							? {
									currentLocationHint: actionResult.actionResult.locationAfter,
								}
							: {}),
					}),
			});
			assertToolSuccess({
				step: "world_sync",
				toolRpcResult: null,
				result: worldSyncResult,
			});
		}
		let tickResult: unknown = null;
		if (payload.autoTick) {
			tickResult = await runOrchestratorStep({
				workflow,
				step: "simulation_tick",
				telemetryEnabled,
				fn: () =>
					runSimulationTick({
						auth,
						mode: "turn",
						tickCount: 1,
						idempotencyKey: `${workflowId}::tick`,
						dryRun: false,
					}),
			});
			assertToolSuccess({
				step: "simulation_tick",
				toolRpcResult: null,
				result: tickResult,
			});
		}

		let stateResult: unknown = null;
		let resourcesResult: unknown = null;
		if (payload.includeState) {
			const worldStateCall = await runOrchestratorStep({
				workflow,
				step: "world_state_overview",
				telemetryEnabled,
				fn: () =>
					callMcpJsonRpc({
						request,
						auth,
						sessionId: activeSessionId,
						body: {
							jsonrpc: "2.0",
							id: 8,
							method: "tools/call",
							params: {
								name: "world_state_overview",
								arguments: {},
							},
						},
					}),
			});
			const timelineDiffCall = await runOrchestratorStep({
				workflow,
				step: "timeline_diff",
				telemetryEnabled,
				fn: () =>
					callMcpJsonRpc({
						request,
						auth,
						sessionId: activeSessionId,
						body: {
							jsonrpc: "2.0",
							id: 9,
							method: "tools/call",
							params: {
								name: "timeline_diff",
								arguments: {},
							},
						},
					}),
			});
			const playerKnowledgeCall = await runOrchestratorStep({
				workflow,
				step: "player_knowledge_view",
				telemetryEnabled,
				fn: () =>
					callMcpJsonRpc({
						request,
						auth,
						sessionId: activeSessionId,
						body: {
							jsonrpc: "2.0",
							id: 10,
							method: "tools/call",
							params: {
								name: "player_knowledge_view",
								arguments: {
									playerView: true,
								},
							},
						},
					}),
			});

			const worldStateResult =
				isRecord(worldStateCall.lastEvent) &&
				isRecord(worldStateCall.lastEvent.result)
					? readToolPayload(worldStateCall.lastEvent.result)
					: null;
			const timelineDiffResult =
				isRecord(timelineDiffCall.lastEvent) &&
				isRecord(timelineDiffCall.lastEvent.result)
					? readToolPayload(timelineDiffCall.lastEvent.result)
					: null;
			const playerKnowledgeResult =
				isRecord(playerKnowledgeCall.lastEvent) &&
				isRecord(playerKnowledgeCall.lastEvent.result)
					? readToolPayload(playerKnowledgeCall.lastEvent.result)
					: null;
			stateResult = worldStateResult;
			resourcesResult = {
				worldStateOverview: worldStateResult,
				timelineDiff: timelineDiffResult,
				playerKnowledge: playerKnowledgeResult,
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
				workflowPrompt: null,
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
