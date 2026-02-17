import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateRequest, apiKeyMap } from "./src/auth";
import { PORT } from "./src/config";
import { corsHeaders, jsonRpcError, withCors } from "./src/http/response";
import { createServer } from "./src/server/create-server";
import type { AuthContext, Session } from "./src/types";

const sessions = new Map<string, Session>();

async function createAndHandleSessionRequest(
	request: Request,
	auth: AuthContext,
): Promise<Response> {
	const server = createServer(auth);
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
			sessions.set(sessionId, {
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
			sessions.delete(sessionId);
			void closeServerOnce();
			console.log(`Session closed: ${sessionId}`);
		},
	});

	transport.onclose = () => {
		const sessionId = transport.sessionId;
		if (sessionId) {
			sessions.delete(sessionId);
		}
		void closeServerOnce();
	};

	await server.connect(transport);
	return transport.handleRequest(request);
}

async function handleMcpPost(
	request: Request,
	auth: AuthContext,
): Promise<Response> {
	const existingSessionId = request.headers.get("mcp-session-id");
	if (existingSessionId) {
		const existing = sessions.get(existingSessionId);
		if (!existing) {
			return jsonRpcError(404, -32000, "Session not found");
		}
		return withCors(await existing.transport.handleRequest(request));
	}

	return withCors(await createAndHandleSessionRequest(request, auth));
}

async function handleMcpGetOrDelete(request: Request): Promise<Response> {
	const sessionId = request.headers.get("mcp-session-id");
	if (!sessionId) {
		return jsonRpcError(400, -32000, "Missing mcp-session-id header");
	}

	const existing = sessions.get(sessionId);
	if (!existing) {
		return jsonRpcError(404, -32000, "Session not found");
	}

	return withCors(await existing.transport.handleRequest(request));
}

process.on("unhandledRejection", (reason) => {
	console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (error) => {
	console.error("Uncaught exception:", error);
});

const server = Bun.serve({
	port: PORT,
	idleTimeout: 0,
	async fetch(request, bunServer) {
		const url = new URL(request.url);

		if (url.pathname === "/health") {
			return withCors(
				new Response(
					JSON.stringify({
						status: "ok",
						authRequired: apiKeyMap.size > 0,
						configuredApiKeys: apiKeyMap.size,
					}),
					{ headers: { "content-type": "application/json" } },
				),
			);
		}

		if (url.pathname !== "/mcp") {
			return withCors(new Response("Not Found", { status: 404 }));
		}

		bunServer.timeout(request, 0);

		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: corsHeaders() });
		}

		try {
			const auth = authenticateRequest(request, sessions);
			if (auth instanceof Response) {
				return auth;
			}

			if (request.method === "POST") {
				return await handleMcpPost(request, auth);
			}

			if (request.method === "GET" || request.method === "DELETE") {
				return await handleMcpGetOrDelete(request);
			}

			return new Response("Method Not Allowed", {
				status: 405,
				headers: {
					allow: "GET, POST, DELETE, OPTIONS",
					...corsHeaders(),
				},
			});
		} catch (error) {
			console.error("Unhandled /mcp error:", error);
			return jsonRpcError(500, -32603, "Internal server error");
		}
	},
});

console.log(`MCP server listening at ${new URL("/mcp", server.url).toString()}`);
console.log(
	apiKeyMap.size > 0
		? `API key auth enabled (${apiKeyMap.size} key(s) configured)`
		: "API key auth disabled (BARDO_API_KEYS_JSON not configured or invalid)",
);
