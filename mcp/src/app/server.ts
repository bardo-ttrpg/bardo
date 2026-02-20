import { PORT } from "../domain/config/constants";
import { SECURITY_POLICY } from "../domain/config/security";
import { SessionStore } from "../session/session-store";
import { authenticateRequest } from "./middleware/auth";
import { corsHeaders, jsonRpcError, withCors } from "./middleware/cors";
import { createRateLimiter } from "./middleware/rate-limiter";
import {
	getRateLimitKey,
	isRequestPayloadTooLarge,
} from "./middleware/request-guards";
import { handleHealthRequest } from "./routes/health";
import { handleMcpRequest } from "./routes/mcp";
import { handleResolveTurnRequest } from "./routes/turns-orchestrator";

type ServerOptions = {
	port?: number;
	sessionStore?: SessionStore;
};

export function createHttpServer({
	port = PORT,
	sessionStore = new SessionStore({
		sessionTtlMs: SECURITY_POLICY.sessionTtlMs,
		onEvictSession: (_sessionId, session) => {
			void session.server.close();
		},
	}),
}: ServerOptions = {}) {
	const rateLimiter = createRateLimiter({
		windowMs: SECURITY_POLICY.rateLimitWindowMs,
		maxRequests: SECURITY_POLICY.rateLimitMaxRequests,
		failClosed: SECURITY_POLICY.rateLimitFailClosed,
	});

	return Bun.serve({
		port,
		idleTimeout: 0,
		async fetch(request, bunServer) {
			const url = new URL(request.url);
			const isMcpRoute = url.pathname === "/mcp";
			const isTurnsApiRoute = url.pathname === "/api/v1/turns/resolve";

			if (url.pathname === "/health") {
				return handleHealthRequest();
			}

			if (!isMcpRoute && !isTurnsApiRoute) {
				return withCors(new Response("Not Found", { status: 404 }));
			}

			bunServer.timeout(request, 0);

			if (request.method === "OPTIONS") {
				return new Response(null, { status: 204, headers: corsHeaders() });
			}

			sessionStore.sweepExpired();

			if (
				request.method === "POST" &&
				isRequestPayloadTooLarge(request, SECURITY_POLICY.maxRequestBytes)
			) {
				return jsonRpcError(413, -32010, "Request payload too large");
			}

			try {
				const auth = authenticateRequest(request, sessionStore.asMap());
				if (auth instanceof Response) {
					return auth;
				}

				const limitKey = getRateLimitKey(request, auth.apiKey);
				const limitResult = await rateLimiter.limiter.consume(limitKey);
				if (!limitResult.allowed) {
					return withCors(
						new Response(
							JSON.stringify({
								error: "Rate limit exceeded.",
								retryAfterMs: limitResult.retryAfterMs,
							}),
							{
								status: 429,
								headers: {
									"content-type": "application/json",
									"retry-after": String(
										Math.ceil(limitResult.retryAfterMs / 1000),
									),
									"x-ratelimit-limit": String(limitResult.limit),
									"x-ratelimit-remaining": String(limitResult.remaining),
									"x-ratelimit-reset": String(
										Math.ceil(limitResult.reset / 1000),
									),
								},
							},
						),
					);
				}

				if (isMcpRoute) {
					return await handleMcpRequest(request, auth, sessionStore);
				}

				if (request.method !== "POST") {
					return withCors(
						new Response("Method Not Allowed", {
							status: 405,
							headers: {
								allow: "POST, OPTIONS",
							},
						}),
					);
				}

				return await handleResolveTurnRequest(request, auth);
			} catch (error) {
				console.error("Unhandled /mcp error:", error);
				return jsonRpcError(500, -32603, "Internal server error");
			}
		},
	});
}
