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
} from "./turns-orchestrator-internal";

export { parseResolveTurnPayload, parseSseJsonEvents };

export async function handleResolveTurnRequest(
	request: Request,
	auth: AuthContext,
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
	let sessionId: string | null = null;

	try {
		const initialize = await callMcpJsonRpc({
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
		});

		sessionId = initialize.sessionId;
		if (!sessionId) {
			throw new Error(
				"MCP session initialization failed (missing session id).",
			);
		}

		await callMcpJsonRpc({
			request,
			auth,
			sessionId,
			body: {
				jsonrpc: "2.0",
				method: "notifications/initialized",
			},
		});

		const actionCall = await callMcpJsonRpc({
			request,
			auth,
			sessionId,
			body: {
				jsonrpc: "2.0",
				id: 2,
				method: "tools/call",
				params: {
					name: "player_action",
					arguments: {
						action: payload.action,
					},
				},
			},
		});

		const actionResult =
			isRecord(actionCall.lastEvent) && isRecord(actionCall.lastEvent.result)
				? readToolPayload(actionCall.lastEvent.result)
				: null;

		let worldSyncResult: unknown = null;
		if (payload.syncWorld && payload.transcript) {
			const syncCall = await callMcpJsonRpc({
				request,
				auth,
				sessionId,
				body: {
					jsonrpc: "2.0",
					id: 3,
					method: "tools/call",
					params: {
						name: "world_sync",
						arguments: {
							transcript: payload.transcript,
						},
					},
				},
			});

			worldSyncResult =
				isRecord(syncCall.lastEvent) && isRecord(syncCall.lastEvent.result)
					? readToolPayload(syncCall.lastEvent.result)
					: null;
		}

		let stateResult: unknown = null;
		if (payload.includeState) {
			const stateCall = await callMcpJsonRpc({
				request,
				auth,
				sessionId,
				body: {
					jsonrpc: "2.0",
					id: 4,
					method: "tools/call",
					params: {
						name: "state_get",
						arguments: {},
					},
				},
			});

			stateResult =
				isRecord(stateCall.lastEvent) && isRecord(stateCall.lastEvent.result)
					? readToolPayload(stateCall.lastEvent.result)
					: null;
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
				worldSync: worldSyncResult,
				state: stateResult,
			},
			{
				"x-workflow-id": workflowId,
			},
		);
	} catch (error) {
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
