import * as Sentry from "@sentry/bun";

type SpanAttributeValue = string | number | boolean;

type SpanLike = {
	setAttribute(name: string, value: SpanAttributeValue): void;
};

type SentryLike = {
	startSpan<T>(
		options: {
			name: string;
			op: string;
			attributes?: Record<string, SpanAttributeValue>;
		},
		callback: (span: SpanLike) => T,
	): T;
	captureException(error: unknown): string | undefined;
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

type UsageLimitSpanAttributesArgs = {
	plan?: "free" | "solo" | "solo_plus" | null;
	backend: "none" | "memory" | "upstash";
	limitPresent: boolean;
	allowed: boolean;
	period?: string | null;
	blockCacheHit: boolean;
	writeTotalsEnabled: boolean;
	writeLastUsedEnabled: boolean;
	writeModelMetadataEnabled: boolean;
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

export function buildUsageLimitSpanAttributes(
	args: UsageLimitSpanAttributesArgs,
): SpanAttributes {
	return compactAttributes({
		"bardo.usage.plan": args.plan,
		"bardo.usage.backend": args.backend,
		"bardo.usage.limit_present": args.limitPresent,
		"bardo.usage.allowed": args.allowed,
		"bardo.usage.period": args.period,
		"bardo.usage.block_cache_hit": args.blockCacheHit,
		"bardo.usage.write_totals_enabled": args.writeTotalsEnabled,
		"bardo.usage.write_last_used_enabled": args.writeLastUsedEnabled,
		"bardo.usage.write_model_metadata_enabled": args.writeModelMetadataEnabled,
	});
}

function tracingEnabled(): boolean {
	const enabled = process.env.BARDO_SENTRY_ENABLED?.trim().toLowerCase();
	if (enabled === "false") {
		return false;
	}
	return Boolean(process.env.SENTRY_DSN?.trim());
}

export function withRequestSpan<T>(
	args: Omit<
		RequestSpanAttributesArgs,
		"status" | "rateLimitOutcome" | "usageLimitOutcome"
	>,
	callback: (span: SpanLike) => T,
	options: { enabled?: boolean; sdk?: SentryLike } = {},
): T {
	const enabled = options.enabled ?? tracingEnabled();
	const sdk = options.sdk ?? (Sentry as unknown as SentryLike);
	if (!enabled) {
		return callback({
			setAttribute() {},
		});
	}
	return sdk.startSpan(
		{
			name: `${args.method} ${args.route}`,
			op: "http.server",
			attributes: buildRequestSpanAttributes(args),
		},
		callback,
	);
}

export function withHostedAuthSpan<T>(
	args: Omit<HostedAuthSpanAttributesArgs, "httpOk" | "timeout" | "result">,
	callback: (span: SpanLike) => T,
	options: { enabled?: boolean; sdk?: SentryLike } = {},
): T {
	const enabled = options.enabled ?? tracingEnabled();
	const sdk = options.sdk ?? (Sentry as unknown as SentryLike);
	if (!enabled) {
		return callback({
			setAttribute() {},
		});
	}
	return sdk.startSpan(
		{
			name: "hosted.api_key_introspection",
			op: "http.client",
			attributes: compactAttributes({
				"bardo.auth.provider": args.provider,
				"bardo.auth.cache_hit": args.cacheHit,
				"bardo.auth.required_scope": args.requiredScope,
				"bardo.auth.workspace_override_requested":
					args.workspaceOverrideRequested,
			}),
		},
		callback,
	);
}

export function withUsageLimitSpan<T>(
	callback: (span: SpanLike) => T,
	options: { enabled?: boolean; sdk?: SentryLike } = {},
): T {
	const enabled = options.enabled ?? tracingEnabled();
	const sdk = options.sdk ?? (Sentry as unknown as SentryLike);
	if (!enabled) {
		return callback({
			setAttribute() {},
		});
	}
	return sdk.startSpan(
		{
			name: "mcp.usage_limiter",
			op: "function",
		},
		callback,
	);
}

export function captureSentryException(
	error: unknown,
	options: { enabled?: boolean; sdk?: SentryLike } = {},
): void {
	const enabled = options.enabled ?? tracingEnabled();
	const sdk = options.sdk ?? (Sentry as unknown as SentryLike);
	if (!enabled) {
		return;
	}
	sdk.captureException(error);
}
