import { PORT } from "../domain/config/constants";
import { SessionStore } from "../session/session-store";
import { authenticateRequest } from "./middleware/auth";
import { corsHeaders, jsonRpcError, withCors } from "./middleware/cors";
import { handleHealthRequest } from "./routes/health";
import { handleMcpRequest } from "./routes/mcp";

type ServerOptions = {
	port?: number;
	sessionStore?: SessionStore;
};

export function createHttpServer({
	port = PORT,
	sessionStore = new SessionStore(),
}: ServerOptions = {}) {
	return Bun.serve({
		port,
		idleTimeout: 0,
		async fetch(request, bunServer) {
			const url = new URL(request.url);

			if (url.pathname === "/health") {
				return handleHealthRequest();
			}

			if (url.pathname !== "/mcp") {
				return withCors(new Response("Not Found", { status: 404 }));
			}

			bunServer.timeout(request, 0);

			if (request.method === "OPTIONS") {
				return new Response(null, { status: 204, headers: corsHeaders() });
			}

			try {
				const auth = authenticateRequest(request, sessionStore.asMap());
				if (auth instanceof Response) {
					return auth;
				}

				return await handleMcpRequest(request, auth, sessionStore);
			} catch (error) {
				console.error("Unhandled /mcp error:", error);
				return jsonRpcError(500, -32603, "Internal server error");
			}
		},
	});
}
