import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "../mcp/create-mcp-server";
import type { AuthContext } from "../types/contracts";
import type { SessionStore } from "./session-store";

export async function createAndHandleSessionRequest(
	request: Request,
	auth: AuthContext,
	sessionStore: SessionStore,
): Promise<Response> {
	const server = createMcpServer(auth);
	let closed = false;

	const closeServerOnce = async () => {
		if (closed) return;
		closed = true;
		try {
			await server.close();
		} catch (error) {
			console.error("Error while closing MCP session server:", error);
		}
	};

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
				`Session initialized: ${sessionId} apiKey=${auth.apiKey ?? "none"} root=${auth.campaignBasePath}`,
			);
		},
		onsessionclosed: (sessionId) => {
			sessionStore.delete(sessionId);
			void closeServerOnce();
			console.log(`Session closed: ${sessionId}`);
		},
	});

	transport.onclose = () => {
		const sessionId = transport.sessionId;
		if (sessionId) {
			sessionStore.delete(sessionId);
		}
		void closeServerOnce();
	};

	await server.connect(transport);
	return transport.handleRequest(request);
}
