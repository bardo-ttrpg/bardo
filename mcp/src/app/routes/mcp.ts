import type { SessionStore } from "../../session/session-store";
import { createAndHandleSessionRequest } from "../../session/transport-lifecycle";
import type { AuthContext } from "../../types/contracts";
import { corsHeaders, jsonRpcError, withCors } from "../middleware/cors";

async function handleMcpPost(
	request: Request,
	auth: AuthContext,
	sessionStore: SessionStore,
): Promise<Response> {
	const existingSessionId = request.headers.get("mcp-session-id");
	if (existingSessionId) {
		const existing = sessionStore.get(existingSessionId);
		if (!existing) {
			return jsonRpcError(404, -32000, "Session not found");
		}
		sessionStore.touch(existingSessionId);
		return withCors(await existing.transport.handleRequest(request));
	}

	return withCors(
		await createAndHandleSessionRequest(request, auth, sessionStore),
	);
}

async function handleMcpGetOrDelete(
	request: Request,
	sessionStore: SessionStore,
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

	return withCors(await existing.transport.handleRequest(request));
}

export async function handleMcpRequest(
	request: Request,
	auth: AuthContext,
	sessionStore: SessionStore,
): Promise<Response> {
	if (request.method === "POST") {
		return handleMcpPost(request, auth, sessionStore);
	}

	if (request.method === "GET" || request.method === "DELETE") {
		return handleMcpGetOrDelete(request, sessionStore);
	}

	return new Response("Method Not Allowed", {
		status: 405,
		headers: {
			allow: "GET, POST, DELETE, OPTIONS",
			...corsHeaders(),
		},
	});
}
