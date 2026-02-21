import { PORT } from "../domain/config/constants";
import {
	LOOP_DETECTION_POLICY,
	type LoopDetectionPolicy,
} from "../domain/config/loop-detection";
import {
	SECURITY_POLICY,
	type SecurityPolicy,
} from "../domain/config/security";
import {
	TOOL_POLICY_CONFIG,
	type ToolPolicyConfig,
} from "../domain/config/tool-policy";
import { SessionRegistry } from "../session/session-registry";
import { SessionStore } from "../session/session-store";
import {
	normalizeRouteLabel,
	recordHttpRequestMetric,
	recordRateLimitEventMetric,
} from "../telemetry";
import { authenticateRequest } from "./middleware/auth";
import { corsHeaders, jsonRpcError, withCors } from "./middleware/cors";
import { createRateLimiter } from "./middleware/rate-limiter";
import {
	getRateLimitKey,
	isRequestPayloadTooLarge,
} from "./middleware/request-guards";
import { handleHealthRequest } from "./routes/health";
import { handleInitBootstrapRequest } from "./routes/init-bootstrap-orchestrator";
import { handleMcpRequest } from "./routes/mcp";
import { handleMetricsRequest } from "./routes/metrics";
import { handleResolveTurnRequest } from "./routes/turns-orchestrator";
import { handleWorldTickRequest } from "./routes/world-tick-orchestrator";

type ServerOptions = {
	port?: number;
	sessionStore?: SessionStore;
	sessionRegistry?: SessionRegistry;
	securityPolicy?: SecurityPolicy;
	toolPolicy?: ToolPolicyConfig;
	loopPolicy?: LoopDetectionPolicy;
};

function metricsAuthRequiredResponse(): Response {
	return withCors(
		new Response(
			JSON.stringify({
				error: "Metrics endpoint requires an authenticated API key.",
			}),
			{
				status: 401,
				headers: {
					"content-type": "application/json",
				},
			},
		),
	);
}

export function createHttpServer({
	port = PORT,
	securityPolicy = SECURITY_POLICY,
	toolPolicy = TOOL_POLICY_CONFIG,
	loopPolicy = LOOP_DETECTION_POLICY,
	sessionRegistry = new SessionRegistry({ loopPolicy }),
	sessionStore,
}: ServerOptions = {}) {
	const store =
		sessionStore ??
		new SessionStore({
			sessionTtlMs: securityPolicy.sessionTtlMs,
			onEvictSession: (sessionId, session) => {
				sessionRegistry.closeSession(sessionId);
				void session.server.close();
			},
		});

	const rateLimiter = createRateLimiter({
		windowMs: securityPolicy.rateLimitWindowMs,
		maxRequests: securityPolicy.rateLimitMaxRequests,
		failClosed: securityPolicy.rateLimitFailClosed,
	});

	return Bun.serve({
		port,
		idleTimeout: 0,
		async fetch(request, bunServer) {
			const startedAt = performance.now();
			const method = request.method;
			const url = new URL(request.url);
			const route = normalizeRouteLabel(url.pathname);
			const isMcpRoute = url.pathname === "/mcp";
			const isTurnsApiRoute = url.pathname === "/api/v1/turns/resolve";
			const isInitBootstrapApiRoute = url.pathname === "/api/v1/init/bootstrap";
			const isWorldTickApiRoute = url.pathname === "/api/v1/world/tick";
			const isMetricsRoute = url.pathname === "/metrics";

			const finalize = (response: Response): Response => {
				if (securityPolicy.telemetryEnabled) {
					recordHttpRequestMetric({
						route,
						method,
						status: response.status,
						durationMs: performance.now() - startedAt,
					});
				}
				return response;
			};

			if (url.pathname === "/health") {
				return finalize(handleHealthRequest());
			}

			if (
				!isMcpRoute &&
				!isTurnsApiRoute &&
				!isInitBootstrapApiRoute &&
				!isWorldTickApiRoute &&
				!isMetricsRoute
			) {
				return finalize(withCors(new Response("Not Found", { status: 404 })));
			}

			bunServer.timeout(request, 0);

			if (request.method === "OPTIONS") {
				return finalize(
					new Response(null, { status: 204, headers: corsHeaders() }),
				);
			}

			store.sweepExpired();

			if (isMetricsRoute) {
				if (
					!securityPolicy.metricsRouteEnabled ||
					!securityPolicy.telemetryEnabled
				) {
					return finalize(withCors(new Response("Not Found", { status: 404 })));
				}

				if (request.method !== "GET") {
					return finalize(
						withCors(
							new Response("Method Not Allowed", {
								status: 405,
								headers: {
									allow: "GET, OPTIONS",
								},
							}),
						),
					);
				}

				if (securityPolicy.metricsRequireAuth) {
					const auth = authenticateRequest(request, store.asMap());
					if (auth instanceof Response) {
						return finalize(auth);
					}
					if (!auth.apiKey) {
						return finalize(metricsAuthRequiredResponse());
					}
				}

				return finalize(handleMetricsRequest());
			}

			if (
				request.method === "POST" &&
				isRequestPayloadTooLarge(request, securityPolicy.maxRequestBytes)
			) {
				return finalize(jsonRpcError(413, -32010, "Request payload too large"));
			}

			try {
				const auth = authenticateRequest(request, store.asMap());
				if (auth instanceof Response) {
					return finalize(auth);
				}

				const limitKey = getRateLimitKey(request, auth.apiKey);
				const limitResult = await rateLimiter.limiter.consume(limitKey);
				if (!limitResult.allowed) {
					if (securityPolicy.telemetryEnabled) {
						recordRateLimitEventMetric("blocked");
					}
					return finalize(
						withCors(
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
						),
					);
				}

				if (securityPolicy.telemetryEnabled) {
					recordRateLimitEventMetric("allowed");
				}

				if (isMcpRoute) {
					return finalize(
						await handleMcpRequest(
							request,
							auth,
							store,
							sessionRegistry,
							toolPolicy,
							loopPolicy,
							securityPolicy.telemetryEnabled,
						),
					);
				}

				if (request.method !== "POST") {
					return finalize(
						withCors(
							new Response("Method Not Allowed", {
								status: 405,
								headers: {
									allow: "POST, OPTIONS",
								},
							}),
						),
					);
				}

				if (isTurnsApiRoute) {
					return finalize(
						await handleResolveTurnRequest(
							request,
							auth,
							securityPolicy.telemetryEnabled,
						),
					);
				}

				if (isInitBootstrapApiRoute) {
					return finalize(
						await handleInitBootstrapRequest(
							request,
							auth,
							securityPolicy.telemetryEnabled,
						),
					);
				}

				return finalize(
					await handleWorldTickRequest(
						request,
						auth,
						securityPolicy.telemetryEnabled,
					),
				);
			} catch (error) {
				if (securityPolicy.telemetryEnabled) {
					recordRateLimitEventMetric("error");
				}
				console.error("Unhandled /mcp error:", error);
				return finalize(jsonRpcError(500, -32603, "Internal server error"));
			}
		},
	});
}
