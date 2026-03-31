type SpanAttributeValue = string | number | boolean;

type SpanLike = {
	setAttribute(name: string, value: SpanAttributeValue): void;
};

type SpanAttributes = Record<string, SpanAttributeValue>;

type RequestSpanAttributesArgs = {
	route: string;
	method: string;
	status?: number;
	authMode?: string;
	rateLimitOutcome?: "allowed" | "blocked" | "error";
	usageLimitOutcome?: "allowed" | "blocked" | "skipped";
	transportMode: string;
	metricsRouteAuthRequired: boolean;
};

type HostedAuthSpanAttributesArgs = {
	provider: "env" | "hosted" | "hybrid";
	cacheHit: boolean;
	requiredScope: "mcp" | "api";
	workspaceOverrideRequested: boolean;
	httpOk?: boolean;
	timeout?: boolean;
	result: "valid" | "invalid" | "error";
};

function compactAttributes(
	attributes: Record<string, SpanAttributeValue | null | undefined>,
): SpanAttributes {
	return Object.fromEntries(
		Object.entries(attributes).filter(
			([, value]) => value !== null && value !== undefined,
		),
	) as SpanAttributes;
}

function createNoopSpan(): SpanLike {
	return {
		setAttribute() {},
	};
}

export function applySpanAttributes(
	span: SpanLike,
	attributes: Record<string, SpanAttributeValue | null | undefined>,
): void {
	for (const [key, value] of Object.entries(attributes)) {
		if (value !== null && value !== undefined) {
			span.setAttribute(key, value);
		}
	}
}

export function buildRequestSpanAttributes(
	args: RequestSpanAttributesArgs,
): SpanAttributes {
	return compactAttributes({
		"bardo.service": "mcp",
		"bardo.route": args.route,
		"http.method": args.method,
		"http.status_code": args.status,
		"bardo.auth.mode": args.authMode,
		"bardo.rate_limit.outcome": args.rateLimitOutcome,
		"bardo.usage_limit.outcome": args.usageLimitOutcome,
		"bardo.transport_mode": args.transportMode,
		"bardo.metrics_route_auth_required": args.metricsRouteAuthRequired,
	});
}

export function buildHostedAuthSpanAttributes(
	args: HostedAuthSpanAttributesArgs,
): SpanAttributes {
	return compactAttributes({
		"bardo.auth.provider": args.provider,
		"bardo.auth.cache_hit": args.cacheHit,
		"bardo.auth.required_scope": args.requiredScope,
		"bardo.auth.workspace_override_requested": args.workspaceOverrideRequested,
		"bardo.auth.introspection_http_ok": args.httpOk,
		"bardo.auth.introspection_timeout": args.timeout,
		"bardo.auth.result": args.result,
	});
}

export function withRequestSpan<T>(
	_args: Omit<
		RequestSpanAttributesArgs,
		"status" | "rateLimitOutcome" | "usageLimitOutcome"
	>,
	callback: (span: SpanLike) => T,
): T {
	return callback(createNoopSpan());
}

export function withHostedAuthSpan<T>(
	_args: Omit<HostedAuthSpanAttributesArgs, "httpOk" | "timeout" | "result">,
	callback: (span: SpanLike) => T,
): T {
	return callback(createNoopSpan());
}
