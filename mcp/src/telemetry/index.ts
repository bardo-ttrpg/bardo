import { MetricsRegistry } from "./registry";

const LATENCY_BUCKETS = [
	5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000,
] as const;

export const METRIC_NAMES = {
	httpRequestsTotal: "bardo_http_requests_total",
	httpRequestDurationMs: "bardo_http_request_duration_ms",
	orchestratorWorkflowsTotal: "bardo_orchestrator_workflows_total",
	orchestratorStepDurationMs: "bardo_orchestrator_step_duration_ms",
	mcpJsonRpcCallsTotal: "bardo_mcp_jsonrpc_calls_total",
	mcpJsonRpcDurationMs: "bardo_mcp_jsonrpc_duration_ms",
	toolCallsTotal: "bardo_tool_calls_total",
	toolDurationMs: "bardo_tool_duration_ms",
	rateLimitEventsTotal: "bardo_rate_limit_events_total",
} as const;

export const telemetryRegistry = new MetricsRegistry();

function registerDefaultMetrics(): void {
	telemetryRegistry.registerCounter(METRIC_NAMES.httpRequestsTotal, {
		help: "Total HTTP requests handled by Bardo MCP.",
	});
	telemetryRegistry.registerHistogram(METRIC_NAMES.httpRequestDurationMs, {
		help: "HTTP request latency in milliseconds.",
		buckets: LATENCY_BUCKETS,
	});
	telemetryRegistry.registerCounter(METRIC_NAMES.orchestratorWorkflowsTotal, {
		help: "Total orchestrator workflow executions.",
	});
	telemetryRegistry.registerHistogram(METRIC_NAMES.orchestratorStepDurationMs, {
		help: "Orchestrator step latency in milliseconds.",
		buckets: LATENCY_BUCKETS,
	});
	telemetryRegistry.registerCounter(METRIC_NAMES.mcpJsonRpcCallsTotal, {
		help: "Total MCP JSON-RPC calls observed at /mcp.",
	});
	telemetryRegistry.registerHistogram(METRIC_NAMES.mcpJsonRpcDurationMs, {
		help: "MCP JSON-RPC call latency in milliseconds.",
		buckets: LATENCY_BUCKETS,
	});
	telemetryRegistry.registerCounter(METRIC_NAMES.toolCallsTotal, {
		help: "Total MCP tool calls.",
	});
	telemetryRegistry.registerHistogram(METRIC_NAMES.toolDurationMs, {
		help: "MCP tool call latency in milliseconds.",
		buckets: LATENCY_BUCKETS,
	});
	telemetryRegistry.registerCounter(METRIC_NAMES.rateLimitEventsTotal, {
		help: "Rate limit outcomes.",
	});
}

registerDefaultMetrics();

export function resetTelemetryForTests(): void {
	telemetryRegistry.reset();
	registerDefaultMetrics();
}

export function renderPrometheusMetrics(): string {
	return telemetryRegistry.toPrometheusText();
}

export function normalizeRouteLabel(pathname: string): string {
	switch (pathname) {
		case "/mcp":
		case "/health":
		case "/metrics":
		case "/api/v1/turns/resolve":
		case "/api/v1/init/bootstrap":
		case "/api/v1/world/tick":
			return pathname;
		default:
			return pathname.startsWith("/api/") ? "/api/unknown" : "/unknown";
	}
}

export function recordHttpRequestMetric({
	route,
	method,
	status,
	durationMs,
}: {
	route: string;
	method: string;
	status: number;
	durationMs: number;
}): void {
	const labels = {
		route,
		method,
		status,
	};
	telemetryRegistry.inc(METRIC_NAMES.httpRequestsTotal, labels);
	telemetryRegistry.observe(
		METRIC_NAMES.httpRequestDurationMs,
		durationMs,
		labels,
	);
}

export function recordOrchestratorWorkflowMetric({
	workflow,
	status,
}: {
	workflow: string;
	status: "success" | "error";
}): void {
	telemetryRegistry.inc(METRIC_NAMES.orchestratorWorkflowsTotal, {
		workflow,
		status,
	});
}

export function recordOrchestratorStepMetric({
	workflow,
	step,
	status,
	durationMs,
}: {
	workflow: string;
	step: string;
	status: "success" | "error";
	durationMs: number;
}): void {
	telemetryRegistry.observe(
		METRIC_NAMES.orchestratorStepDurationMs,
		durationMs,
		{
			workflow,
			step,
			status,
		},
	);
}

export function recordJsonRpcMetric({
	method,
	status,
	durationMs,
}: {
	method: string;
	status: "success" | "error";
	durationMs: number;
}): void {
	const labels = {
		method,
		status,
	};
	telemetryRegistry.inc(METRIC_NAMES.mcpJsonRpcCallsTotal, labels);
	telemetryRegistry.observe(
		METRIC_NAMES.mcpJsonRpcDurationMs,
		durationMs,
		labels,
	);
}

export function recordToolCallMetric({
	tool,
	status,
	durationMs,
}: {
	tool: string;
	status: "success" | "error";
	durationMs: number;
}): void {
	const labels = {
		tool,
		status,
	};
	telemetryRegistry.inc(METRIC_NAMES.toolCallsTotal, labels);
	telemetryRegistry.observe(METRIC_NAMES.toolDurationMs, durationMs, labels);
}

export function recordRateLimitEventMetric(
	outcome: "allowed" | "blocked" | "error",
): void {
	telemetryRegistry.inc(METRIC_NAMES.rateLimitEventsTotal, { outcome });
}
