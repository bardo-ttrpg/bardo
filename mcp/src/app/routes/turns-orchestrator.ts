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

		const actionResult =
			isRecord(actionCall.lastEvent) && isRecord(actionCall.lastEvent.result)
				? readToolPayload(actionCall.lastEvent.result)
				: null;

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

			worldSyncResult =
				isRecord(syncCall.lastEvent) && isRecord(syncCall.lastEvent.result)
					? readToolPayload(syncCall.lastEvent.result)
					: null;
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

			tickResult =
				isRecord(tickCall.lastEvent) && isRecord(tickCall.lastEvent.result)
					? readToolPayload(tickCall.lastEvent.result)
					: null;
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

		const consistencyResult =
			isRecord(consistencyCall.lastEvent) &&
			isRecord(consistencyCall.lastEvent.result)
				? readToolPayload(consistencyCall.lastEvent.result)
				: null;

		let stateResult: unknown = null;
		if (payload.includeState) {
			const stateCall = await runOrchestratorStep({
				workflow,
				step: "state_get",
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
								name: "state_get",
								arguments: {},
							},
						},
					}),
			});

			stateResult =
				isRecord(stateCall.lastEvent) && isRecord(stateCall.lastEvent.result)
					? readToolPayload(stateCall.lastEvent.result)
					: null;
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
				worldSync: worldSyncResult,
				tick: tickResult,
				consistency: consistencyResult,
				state: stateResult,
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
