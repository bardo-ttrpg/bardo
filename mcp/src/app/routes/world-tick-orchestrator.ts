import * as z from "zod/v4";
import { recordOrchestratorWorkflowMetric } from "../../telemetry";
import type { AuthContext } from "../../types/contracts";
import {
	buildJsonResponse,
	callMcpJsonRpc,
	closeSession,
	isRecord,
	readToolPayload,
	runOrchestratorStep,
} from "./turns-orchestrator-internal";

const worldTickPayloadSchema = z.object({
	mode: z.enum(["turn", "scheduled"]).default("turn"),
	tickCount: z.number().int().min(1).max(5).optional(),
	idempotencyKey: z.string().trim().min(8).max(256),
	dryRun: z.boolean().optional(),
});

type WorldTickPayload = z.infer<typeof worldTickPayloadSchema>;

export function parseWorldTickPayload(input: unknown): WorldTickPayload {
	const parsed = worldTickPayloadSchema.safeParse(input);
	if (!parsed.success) {
		const firstIssue = parsed.error.issues[0];
		const issueText =
			firstIssue?.message ??
			"Payload must include a valid idempotencyKey and tick options.";
		throw new Error(`Invalid world tick payload: ${issueText}`);
	}
	return parsed.data;
}

export async function handleWorldTickRequest(
	request: Request,
	auth: AuthContext,
	telemetryEnabled = true,
): Promise<Response> {
	let payload: WorldTickPayload;
	try {
		const raw = await request.json();
		payload = parseWorldTickPayload(raw);
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
	const workflow = "world_tick";
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
								name: "bardo-world-tick-orchestrator",
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
						id: 2,
						method: "tools/call",
						params: {
							name: "simulation_tick",
							arguments: {
								mode: payload.mode,
								tickCount: payload.tickCount ?? 1,
								idempotencyKey: payload.idempotencyKey,
								dryRun: payload.dryRun ?? false,
							},
						},
					},
				}),
		});

		const tickResult =
			isRecord(tickCall.lastEvent) && isRecord(tickCall.lastEvent.result)
				? readToolPayload(tickCall.lastEvent.result)
				: null;

		if (telemetryEnabled) {
			recordOrchestratorWorkflowMetric({ workflow, status: "success" });
		}
		return buildJsonResponse(
			200,
			{
				success: true,
				workflowId,
				mode: "orchestrated-world-tick",
				tick: tickResult,
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
			error instanceof Error ? error.message : "Failed to process world tick.";
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
