import * as z from "zod/v4";
import type { AuthContext } from "../../types/contracts";
import { withCors } from "../middleware/cors";

const resolveTurnPayloadSchema = z.object({
	action: z.string().min(1).max(1000),
	transcript: z.string().min(1).max(40_000).optional(),
	syncWorld: z.boolean().optional(),
	includeState: z.boolean().optional(),
});

type ResolveTurnPayload = {
	action: string;
	transcript: string | null;
	syncWorld: boolean;
	includeState: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readToolPayload(result: Record<string, unknown>): unknown {
	if (isRecord(result.structuredContent)) {
		return result.structuredContent;
	}

	const content = result.content;
	if (!Array.isArray(content)) {
		return result;
	}

	for (const item of content) {
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

function buildJsonResponse(
	status: number,
	payload: Record<string, unknown>,
	extraHeaders?: Record<string, string>,
): Response {
	return withCors(
		new Response(JSON.stringify(payload), {
			status,
			headers: {
				"content-type": "application/json",
				...extraHeaders,
			},
		}),
	);
}

function extractJsonRpcError(
	responseStatus: number,
	events: unknown[],
	rawBody: string,
): string {
	for (const event of events) {
		if (!isRecord(event) || !isRecord(event.error)) {
			continue;
		}
		const message = event.error.message;
		if (typeof message === "string" && message.trim().length > 0) {
			return message;
		}
	}

	try {
		const parsed = JSON.parse(rawBody);
		if (isRecord(parsed) && typeof parsed.error === "string") {
			return parsed.error;
		}
	} catch {
		// no-op: fallback below
	}

	return `MCP request failed with status ${responseStatus}.`;
}

async function callMcpJsonRpc({
	request,
	auth,
	sessionId,
	body,
}: {
	request: Request;
	auth: AuthContext;
	sessionId?: string;
	body: Record<string, unknown>;
}): Promise<{
	sessionId: string | null;
	lastEvent: Record<string, unknown> | null;
}> {
	const headers = new Headers({
		accept: "application/json, text/event-stream",
		"content-type": "application/json",
	});

	if (auth.apiKey) {
		headers.set("x-api-key", auth.apiKey);
	}

	if (sessionId) {
		headers.set("mcp-session-id", sessionId);
	}

	const response = await fetch(new URL("/mcp", request.url), {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
	const rawBody = await response.text();
	const events = parseSseJsonEvents(rawBody);
	const lastEvent = events.findLast(isRecord) ?? null;

	if (!response.ok) {
		throw new Error(extractJsonRpcError(response.status, events, rawBody));
	}

	const nextSessionId =
		response.headers.get("mcp-session-id") ?? sessionId ?? null;
	return { sessionId: nextSessionId, lastEvent };
}

async function closeSession(
	request: Request,
	auth: AuthContext,
	sessionId: string,
): Promise<void> {
	const headers = new Headers({
		accept: "application/json, text/event-stream",
		"mcp-session-id": sessionId,
	});
	if (auth.apiKey) {
		headers.set("x-api-key", auth.apiKey);
	}

	await fetch(new URL("/mcp", request.url), {
		method: "DELETE",
		headers,
	});
}

export function parseSseJsonEvents(rawBody: string): unknown[] {
	const events: unknown[] = [];
	for (const line of rawBody.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("data:")) {
			continue;
		}
		const jsonChunk = trimmed.slice("data:".length).trim();
		if (!jsonChunk) {
			continue;
		}
		try {
			events.push(JSON.parse(jsonChunk));
		} catch {
			// Ignore malformed chunks and continue to next event.
		}
	}

	if (events.length > 0) {
		return events;
	}

	try {
		return [JSON.parse(rawBody)];
	} catch {
		return [];
	}
}

export function parseResolveTurnPayload(input: unknown): ResolveTurnPayload {
	const parsed = resolveTurnPayloadSchema.safeParse(input);
	if (!parsed.success) {
		const firstIssue = parsed.error.issues[0];
		const issueText =
			firstIssue?.message ?? "Payload must include a valid action.";
		throw new Error(`Invalid turn payload: ${issueText}`);
	}

	const transcript = parsed.data.transcript?.trim() || null;
	const syncWorld = parsed.data.syncWorld ?? Boolean(transcript);

	return {
		action: parsed.data.action.trim(),
		transcript,
		syncWorld: syncWorld && Boolean(transcript),
		includeState: parsed.data.includeState ?? true,
	};
}

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
