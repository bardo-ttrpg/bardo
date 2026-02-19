import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "../mcp/create-mcp-server";
import type { AuthContext } from "../types/contracts";
import type { SessionStore } from "./session-store";

export function createSessionFinalizer(
	sessionStore: Pick<SessionStore, "delete">,
	closeServer: () => Promise<void> | void,
): (sessionId?: string | null) => void {
	const deletedSessionIds = new Set<string>();
	let closed = false;

	return (sessionId?: string | null) => {
		if (sessionId && !deletedSessionIds.has(sessionId)) {
			deletedSessionIds.add(sessionId);
			sessionStore.delete(sessionId);
		}

		if (closed) return;
		closed = true;
		void closeServer();
	};
}

export async function createAndHandleSessionRequest(
	request: Request,
	auth: AuthContext,
	sessionStore: SessionStore,
): Promise<Response> {
	const server = createMcpServer(auth);
	const closeServer = async () => {
		try {
			await server.close();
		} catch (error) {
			console.error("Error while closing MCP session server:", error);
		}
	};
	const finalizeSession = createSessionFinalizer(sessionStore, closeServer);

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: () => crypto.randomUUID(),
		onsessioninitialized: (sessionId) => {
			sessionStore.set(sessionId, {
				apiKey: auth.apiKey,
				campaignBasePath: auth.campaignBasePath,
				server,
				transport,
			});
			console.log(
				`Session initialized: ${sessionId} auth=${auth.apiKey ? "api-key" : "anonymous"}`,
			);
		},
		onsessionclosed: (sessionId) => {
			finalizeSession(sessionId);
			console.log(`Session closed: ${sessionId}`);
		},
	});

	transport.onclose = () => {
		finalizeSession(transport.sessionId);
	};

	await server.connect(transport);
	return transport.handleRequest(request);
}
