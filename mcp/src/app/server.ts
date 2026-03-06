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
	applySpanAttributes,
	buildRequestSpanAttributes,
	captureSentryException,
	logSentryMessage,
	normalizeRouteLabel,
	recordHttpRequestMetric,
	recordRateLimitEventMetric,
	withRequestSpan,
} from "../telemetry";
import type { JsonRpcMetadata } from "./jsonrpc-metadata";
import { authenticateRequest } from "./middleware/auth";
import { corsHeaders, jsonRpcError, withCors } from "./middleware/cors";
import {
	createMcpUsageLimiter,
	type McpUsageLimiter,
} from "./middleware/mcp-usage-limiter";
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
import { handleValidateAndMeterRequest } from "./routes/validate-and-meter";
import { handleWorldTickRequest } from "./routes/world-tick-orchestrator";
import { resolveUsageMetering } from "./usage-metering";

type ServerOptions = {
	port?: number;
	sessionStore?: SessionStore;
	sessionRegistry?: SessionRegistry;
	securityPolicy?: SecurityPolicy;
	toolPolicy?: ToolPolicyConfig;
	loopPolicy?: LoopDetectionPolicy;
	usageLimiter?: McpUsageLimiter;
};

type RequestTimeoutFn = (request: Request, timeoutSeconds: number) => void;

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
	const handleRequest = createHttpRequestHandler({
		securityPolicy,
		toolPolicy,
		loopPolicy,
		sessionRegistry,
		sessionStore,
	});

	return Bun.serve({
		port,
		idleTimeout: 0,
		async fetch(request, bunServer) {
			return handleRequest(request, (req, timeoutSeconds) =>
				bunServer.timeout(req, timeoutSeconds),
			);
		},
	});
}

export function createHttpRequestHandler({
	securityPolicy = SECURITY_POLICY,
	toolPolicy = TOOL_POLICY_CONFIG,
	loopPolicy = LOOP_DETECTION_POLICY,
	sessionRegistry = new SessionRegistry({ loopPolicy }),
	sessionStore,
	usageLimiter,
}: Omit<ServerOptions, "port"> = {}) {
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
	const meteringLimiter = usageLimiter ?? createMcpUsageLimiter();

	return async function handleRequest(
		request: Request,
		setRequestTimeout: RequestTimeoutFn = () => {},
	): Promise<Response> {
		const startedAt = performance.now();
		const method = request.method;
		const url = new URL(request.url);
		const route = normalizeRouteLabel(url.pathname);
		const isMcpRoute = url.pathname === "/mcp" || url.pathname === "/api/mcp";
		const isTurnsApiRoute = url.pathname === "/api/v1/turns/resolve";
		const isInitBootstrapApiRoute = url.pathname === "/api/v1/init/bootstrap";
		const isWorldTickApiRoute = url.pathname === "/api/v1/world/tick";
		const isValidateAndMeterApiRoute =
			url.pathname === "/api/v1/validate-and-meter";
		const isLegacyValidateAndMeterApiRoute =
			url.pathname === "/api/auth/introspect-key";
		const isAnyValidateAndMeterApiRoute =
			isValidateAndMeterApiRoute || isLegacyValidateAndMeterApiRoute;
		const isMetricsRoute = url.pathname === "/metrics";
		return withRequestSpan(
			{
				route,
				method,
				transportMode: securityPolicy.transportMode,
				metricsRouteAuthRequired: securityPolicy.metricsRequireAuth,
			},
			async (span) => {
				let rateLimitOutcome: "allowed" | "blocked" | "error" | undefined;
				let usageLimitOutcome: "allowed" | "blocked" | "skipped" = "skipped";
				let jsonRpcMetadata: JsonRpcMetadata | null = null;

				const finalize = (response: Response): Response => {
					if (securityPolicy.telemetryEnabled) {
						recordHttpRequestMetric({
							route,
							method,
							status: response.status,
							durationMs: performance.now() - startedAt,
						});
					}
					applySpanAttributes(
						span,
						buildRequestSpanAttributes({
							route,
							method,
							status: response.status,
							authMode: securityPolicy.authMode,
							rateLimitOutcome,
							usageLimitOutcome,
							transportMode: securityPolicy.transportMode,
							metricsRouteAuthRequired: securityPolicy.metricsRequireAuth,
						}),
					);
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
					!isAnyValidateAndMeterApiRoute &&
					!isMetricsRoute
				) {
					return finalize(withCors(new Response("Not Found", { status: 404 })));
				}

				setRequestTimeout(request, 0);

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
						return finalize(
							withCors(new Response("Not Found", { status: 404 })),
						);
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
						const auth = await authenticateRequest(request, store.asMap());
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
					return finalize(
						jsonRpcError(413, -32010, "Request payload too large"),
					);
				}

				try {
					const auth = await authenticateRequest(request, store.asMap());
					if (auth instanceof Response) {
						if (isAnyValidateAndMeterApiRoute) {
							return finalize(
								withCors(
									new Response(
										JSON.stringify({
											valid: false,
											reason: "invalid_key",
										}),
										{
											status: 401,
											headers: {
												"content-type": "application/json",
											},
										},
									),
								),
							);
						}
						return finalize(auth);
					}

					const limitKey = getRateLimitKey(request, auth.apiKey);
					const limitResult = await rateLimiter.limiter.consume(limitKey);
					if (!limitResult.allowed) {
						rateLimitOutcome = "blocked";
						if (securityPolicy.telemetryEnabled) {
							recordRateLimitEventMetric("blocked");
						}
						if (isAnyValidateAndMeterApiRoute) {
							return finalize(
								withCors(
									new Response(
										JSON.stringify({
											valid: false,
											reason: "rate_limited",
											retry_after: Math.ceil(limitResult.retryAfterMs / 1000),
										}),
										{
											status: 429,
											headers: {
												"content-type": "application/json",
											},
										},
									),
								),
							);
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

					rateLimitOutcome = "allowed";
					if (securityPolicy.telemetryEnabled) {
						recordRateLimitEventMetric("allowed");
					}

					if (isAnyValidateAndMeterApiRoute) {
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
						return finalize(
							await handleValidateAndMeterRequest({
								request,
								auth,
								meteringLimiter: meteringLimiter,
							}),
						);
					}

					const usageMetering = await resolveUsageMetering(request, {
						isMcpRoute,
						isTurnsApiRoute,
						isInitBootstrapApiRoute,
						isWorldTickApiRoute,
					});
					jsonRpcMetadata = usageMetering.metadata;
					if (usageMetering.units > 0) {
						const usage = await meteringLimiter.consume({
							subjectId: auth.subjectId ?? null,
							keyId: auth.keyId ?? null,
							plan: auth.plan ?? null,
							mcpPeriodLimit: auth.mcpPeriodLimit ?? null,
							providerId: request.headers.get("x-provider-id")?.trim() ?? null,
							modelId: request.headers.get("x-model-id")?.trim() ?? null,
							units: usageMetering.units,
						});
						usageLimitOutcome = usage.allowed ? "allowed" : "blocked";
						if (!usage.allowed) {
							return finalize(
								withCors(
									new Response(
										JSON.stringify({
											error: "MCP usage limit reached for current plan.",
											usage: {
												limit: usage.limit,
												used: usage.usedThisPeriod,
												remaining: usage.remaining,
												period: usage.period,
											},
										}),
										{
											status: 429,
											headers: {
												"content-type": "application/json",
											},
										},
									),
								),
							);
						}
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
								{
									transportMode: securityPolicy.transportMode,
									enableJsonResponse: securityPolicy.mcpEnableJsonResponse,
									metadata: jsonRpcMetadata,
								},
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
					rateLimitOutcome ??= "error";
					if (securityPolicy.telemetryEnabled) {
						recordRateLimitEventMetric("error");
					}
					captureSentryException(error);
					logSentryMessage("error", "mcp.request.unhandled_error", {
						"bardo.service": "mcp",
						"bardo.route": route,
						"http.method": method,
						"bardo.transport_mode": securityPolicy.transportMode,
					});
					console.error("Unhandled /mcp error:", error);
					return finalize(jsonRpcError(500, -32603, "Internal server error"));
				}
			},
		);
	};
}
