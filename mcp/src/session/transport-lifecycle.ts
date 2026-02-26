import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "../mcp/create-mcp-server";
import type { AuthContext } from "../types/contracts";
import type { SessionRegistry } from "./session-registry";
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
	sessionRegistry: SessionRegistry,
): Promise<Response> {
	let transport: WebStandardStreamableHTTPServerTransport;
	const server = createMcpServer(auth, {
		sessionRegistry,
		getCurrentSessionId: () => transport?.sessionId ?? null,
	});
	const closeServer = async () => {
		try {
			await server.close();
		} catch (error) {
			console.error("Error while closing MCP session server:", error);
		}
	};
	const finalizeSession = createSessionFinalizer(sessionStore, closeServer);

	transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: () => crypto.randomUUID(),
		onsessioninitialized: (sessionId) => {
			sessionStore.set(sessionId, {
				apiKey: auth.apiKey,
				campaignBasePath: auth.campaignBasePath,
				server,
				transport,
			});
			sessionRegistry.registerSession({
				sessionId,
				apiKey: auth.apiKey,
				campaignBasePath: auth.campaignBasePath,
			});
			console.log(
				`Session initialized: ${sessionId} auth=${auth.apiKey ? "api-key" : "anonymous"}`,
			);
		},
		onsessionclosed: (sessionId) => {
			finalizeSession(sessionId);
			sessionRegistry.closeSession(sessionId);
			console.log(`Session closed: ${sessionId}`);
		},
	});

	transport.onclose = () => {
		finalizeSession(transport.sessionId);
		if (transport.sessionId) {
			sessionRegistry.closeSession(transport.sessionId);
		}
	};

	await server.connect(transport);
	return transport.handleRequest(request);
}

export async function createAndHandleStatelessRequest(
	request: Request,
	auth: AuthContext,
	options: {
		enableJsonResponse?: boolean;
	} = {},
): Promise<Response> {
	const enableJsonResponse = options.enableJsonResponse ?? true;
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse,
	});
	const server = createMcpServer(auth);
	await server.connect(transport);

	try {
		return await transport.handleRequest(request);
	} finally {
		// In stateless JSON mode the transport has completed all responses by return.
		if (enableJsonResponse) {
			try {
				await server.close();
			} catch (error) {
				console.error(
					"Error while closing stateless MCP server instance:",
					error,
				);
			}
		}
	}
}
