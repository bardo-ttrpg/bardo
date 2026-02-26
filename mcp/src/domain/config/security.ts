export type AuthMode = "optional" | "required";
export type McpTransportMode = "stateful" | "stateless";

export type SecurityPolicy = {
	authMode: AuthMode;
	allowQueryApiKey: boolean;
	maxRequestBytes: number;
	sessionTtlMs: number;
	rateLimitWindowMs: number;
	rateLimitMaxRequests: number;
	rateLimitFailClosed: boolean;
	telemetryEnabled: boolean;
	metricsRouteEnabled: boolean;
	metricsRequireAuth: boolean;
	transportMode: McpTransportMode;
	mcpEnableJsonResponse: boolean;
};

const DEFAULTS = {
	maxRequestBytes: 1_048_576,
	sessionTtlMs: 3_600_000,
	rateLimitWindowMs: 60_000,
	rateLimitMaxRequests: 120,
} as const;

function parsePositiveInteger(
	value: string | undefined,
	fallback: number,
): number {
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.floor(parsed);
}

function resolveAuthMode(
	env: Record<string, string | undefined>,
	isProduction: boolean,
): AuthMode {
	const rawMode = env.BARDO_AUTH_MODE?.trim().toLowerCase();
	if (rawMode === "optional" || rawMode === "required") {
		return rawMode;
	}
	return isProduction ? "required" : "optional";
}

function resolveQueryApiKeyPolicy(
	env: Record<string, string | undefined>,
	isProduction: boolean,
): boolean {
	const rawValue = env.BARDO_ALLOW_QUERY_API_KEY?.trim().toLowerCase();
	if (rawValue === "true") return true;
	if (rawValue === "false") return false;
	return !isProduction;
}

function resolveFailClosedRateLimit(
	env: Record<string, string | undefined>,
	isProduction: boolean,
): boolean {
	const value = env.BARDO_RATE_LIMIT_FAIL_CLOSED?.trim().toLowerCase();
	if (value === "true") return true;
	if (value === "false") return false;
	return isProduction;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return fallback;
}

function resolveTransportMode(
	env: Record<string, string | undefined>,
): McpTransportMode {
	const raw = env.BARDO_MCP_TRANSPORT_MODE?.trim().toLowerCase();
	if (raw === "stateful" || raw === "stateless") {
		return raw;
	}
	return "stateful";
}

function resolveMcpJsonResponse(
	env: Record<string, string | undefined>,
	transportMode: McpTransportMode,
): boolean {
	return parseBoolean(
		env.BARDO_MCP_ENABLE_JSON_RESPONSE,
		transportMode === "stateless",
	);
}

export function resolveSecurityPolicy(
	env: Record<string, string | undefined>,
): SecurityPolicy {
	const isProduction = env.NODE_ENV === "production";
	const transportMode = resolveTransportMode(env);
	return {
		authMode: resolveAuthMode(env, isProduction),
		allowQueryApiKey: resolveQueryApiKeyPolicy(env, isProduction),
		maxRequestBytes: parsePositiveInteger(
			env.BARDO_MAX_REQUEST_BYTES,
			DEFAULTS.maxRequestBytes,
		),
		sessionTtlMs: parsePositiveInteger(
			env.BARDO_SESSION_TTL_MS,
			DEFAULTS.sessionTtlMs,
		),
		rateLimitWindowMs: parsePositiveInteger(
			env.BARDO_RATE_LIMIT_WINDOW_MS,
			DEFAULTS.rateLimitWindowMs,
		),
		rateLimitMaxRequests: parsePositiveInteger(
			env.BARDO_RATE_LIMIT_MAX_REQUESTS,
			DEFAULTS.rateLimitMaxRequests,
		),
		rateLimitFailClosed: resolveFailClosedRateLimit(env, isProduction),
		telemetryEnabled: parseBoolean(env.BARDO_TELEMETRY_ENABLED, true),
		metricsRouteEnabled: parseBoolean(env.BARDO_METRICS_ROUTE_ENABLED, true),
		metricsRequireAuth: parseBoolean(
			env.BARDO_METRICS_REQUIRE_AUTH,
			isProduction,
		),
		transportMode,
		mcpEnableJsonResponse: resolveMcpJsonResponse(env, transportMode),
	};
}

export const SECURITY_POLICY = resolveSecurityPolicy(Bun.env);
