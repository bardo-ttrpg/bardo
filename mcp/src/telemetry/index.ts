import { MetricsRegistry } from "./registry";

export { logSentryMessage } from "./sentry";
export {
	applySpanAttributes,
	buildHostedAuthSpanAttributes,
	buildRequestSpanAttributes,
	buildUsageLimitSpanAttributes,
	captureSentryException,
	withHostedAuthSpan,
	withRequestSpan,
	withUsageLimitSpan,
} from "./sentry-spans";

const LATENCY_BUCKETS = [
	5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000,
] as const;

const METRIC_NAMES = {
	httpRequestsTotal: "bardo_http_requests_total",
	httpRequestDurationMs: "bardo_http_request_duration_ms",
	orchestratorWorkflowsTotal: "bardo_orchestrator_workflows_total",
	orchestratorStepDurationMs: "bardo_orchestrator_step_duration_ms",
	mcpJsonRpcCallsTotal: "bardo_mcp_jsonrpc_calls_total",
	mcpJsonRpcDurationMs: "bardo_mcp_jsonrpc_duration_ms",
	toolCallsTotal: "bardo_tool_calls_total",
	toolDurationMs: "bardo_tool_duration_ms",
	rateLimitEventsTotal: "bardo_rate_limit_events_total",
	setupRunsTotal: "bardo_setup_runs_total",
	setupDurationMs: "bardo_setup_duration_ms",
	setupScanCacheEventsTotal: "bardo_setup_scan_cache_events_total",
	legacyFallbackReadsTotal: "bardo_legacy_fallback_reads_total",
	legacyCompatWritesTotal: "bardo_legacy_compat_writes_total",
	setupLegacyFieldEmitsTotal: "bardo_setup_legacy_field_emits_total",
	evalLongRunRunsTotal: "bardo_eval_long_run_runs_total",
	evalLongRunDurationMs: "bardo_eval_long_run_duration_ms",
	evalLongRunInvariantFailuresTotal:
		"bardo_eval_long_run_invariant_failures_total",
	evalLongRunReplayDriftTotal: "bardo_eval_long_run_replay_drift_total",
} as const;

const telemetryRegistry = new MetricsRegistry();

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
	telemetryRegistry.registerCounter(METRIC_NAMES.setupRunsTotal, {
		help: "Total guided setup flow runs by status.",
	});
	telemetryRegistry.registerHistogram(METRIC_NAMES.setupDurationMs, {
		help: "Guided setup flow latency in milliseconds.",
		buckets: LATENCY_BUCKETS,
	});
	telemetryRegistry.registerCounter(METRIC_NAMES.setupScanCacheEventsTotal, {
		help: "Setup scan-cache file classification outcomes.",
	});
	telemetryRegistry.registerCounter(METRIC_NAMES.legacyFallbackReadsTotal, {
		help: "Legacy projection fallback read outcomes by consumer and strict mode.",
	});
	telemetryRegistry.registerCounter(METRIC_NAMES.legacyCompatWritesTotal, {
		help: "Legacy compatibility state/history write operations by consumer and strict mode.",
	});
	telemetryRegistry.registerCounter(METRIC_NAMES.setupLegacyFieldEmitsTotal, {
		help: "Deprecated setup prompt field emissions by source and field.",
	});
	telemetryRegistry.registerCounter(METRIC_NAMES.evalLongRunRunsTotal, {
		help: "Total long-run campaign stability eval executions by outcome.",
	});
	telemetryRegistry.registerHistogram(METRIC_NAMES.evalLongRunDurationMs, {
		help: "Long-run campaign stability eval duration in milliseconds.",
		buckets: LATENCY_BUCKETS,
	});
	telemetryRegistry.registerCounter(
		METRIC_NAMES.evalLongRunInvariantFailuresTotal,
		{
			help: "Long-run campaign eval invariant failure counts by invariant type.",
		},
	);
	telemetryRegistry.registerCounter(METRIC_NAMES.evalLongRunReplayDriftTotal, {
		help: "Replay drift outcomes for long-run campaign evals.",
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

export function recordSetupFlowMetric({
	status,
	durationMs,
}: {
	status: "needs_input" | "complete" | "error" | "locked";
	durationMs: number;
}): void {
	const labels = { status };
	telemetryRegistry.inc(METRIC_NAMES.setupRunsTotal, labels);
	telemetryRegistry.observe(METRIC_NAMES.setupDurationMs, durationMs, labels);
}

export function recordSetupScanCacheMetric({
	outcome,
	count,
}: {
	outcome: "hit" | "miss";
	count: number;
}): void {
	if (!Number.isFinite(count) || count <= 0) {
		return;
	}
	telemetryRegistry.inc(
		METRIC_NAMES.setupScanCacheEventsTotal,
		{ outcome },
		count,
	);
}

export function recordLegacyFallbackReadMetric(args: {
	consumer: string;
	strictMode: boolean;
	outcome: "used" | "blocked";
}): void {
	telemetryRegistry.inc(METRIC_NAMES.legacyFallbackReadsTotal, {
		consumer: args.consumer,
		strictMode: args.strictMode,
		outcome: args.outcome,
	});
}

export function recordLegacyCompatibilityWriteMetric(args: {
	consumer: string;
	artifact: "state_current" | "state_history";
	strictMode: boolean;
}): void {
	telemetryRegistry.inc(METRIC_NAMES.legacyCompatWritesTotal, {
		consumer: args.consumer,
		artifact: args.artifact,
		strictMode: args.strictMode,
	});
}

export function recordSetupLegacyFieldEmitMetric(args: {
	source: "init" | "player_action" | "init_orchestrator";
	field: "setupQuestion" | "nextPrompts";
}): void {
	telemetryRegistry.inc(METRIC_NAMES.setupLegacyFieldEmitsTotal, {
		source: args.source,
		field: args.field,
	});
}

export function recordLongRunCampaignEvalMetric(args: {
	outcome: "success" | "error";
	durationMs: number;
	turnCount: number;
	failedTurns: number;
	invariantFailures: {
		actionFailed: number;
		eventGrowthViolation: number;
		projectionDrift: number;
		replayEventDrift: number;
		replayProjectionDrift: number;
	};
	replayConsistency: {
		stable: boolean;
		eventCountBeforeReplay: number;
		eventCountAfterReplay: number;
		projectionStable: boolean;
	};
}): void {
	const baseLabels = {
		outcome: args.outcome,
		turnCount: args.turnCount,
	};
	telemetryRegistry.inc(METRIC_NAMES.evalLongRunRunsTotal, baseLabels);
	telemetryRegistry.observe(
		METRIC_NAMES.evalLongRunDurationMs,
		args.durationMs,
		baseLabels,
	);

	const invariantEntries: Array<[string, number]> = [
		["action_failed", args.invariantFailures.actionFailed],
		["event_growth_violation", args.invariantFailures.eventGrowthViolation],
		["projection_drift", args.invariantFailures.projectionDrift],
		["replay_event_drift", args.invariantFailures.replayEventDrift],
		["replay_projection_drift", args.invariantFailures.replayProjectionDrift],
	];
	for (const [invariant, count] of invariantEntries) {
		if (!Number.isFinite(count) || count <= 0) {
			continue;
		}
		telemetryRegistry.inc(
			METRIC_NAMES.evalLongRunInvariantFailuresTotal,
			{
				outcome: args.outcome,
				invariant,
			},
			count,
		);
	}

	const replayEventDriftDetected =
		args.replayConsistency.eventCountBeforeReplay !==
		args.replayConsistency.eventCountAfterReplay;
	if (replayEventDriftDetected) {
		telemetryRegistry.inc(METRIC_NAMES.evalLongRunReplayDriftTotal, {
			dimension: "events",
		});
	}
	if (!args.replayConsistency.projectionStable) {
		telemetryRegistry.inc(METRIC_NAMES.evalLongRunReplayDriftTotal, {
			dimension: "projection",
		});
	}
	if (
		!replayEventDriftDetected &&
		args.replayConsistency.projectionStable &&
		args.replayConsistency.stable
	) {
		telemetryRegistry.inc(METRIC_NAMES.evalLongRunReplayDriftTotal, {
			dimension: "none",
		});
	}
}
