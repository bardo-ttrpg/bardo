import { apiKeyMap } from "./src/app/middleware/auth";
import { createHttpServer } from "./src/app/server";
import { PORT } from "./src/domain/config/constants";
import { LOOP_DETECTION_POLICY } from "./src/domain/config/loop-detection";
import { SECURITY_POLICY } from "./src/domain/config/security";
import { validateRuntimeConfiguration } from "./src/domain/config/strict-config";
import { TOOL_POLICY_CONFIG } from "./src/domain/config/tool-policy";
import {
	captureTelemetryException,
	logTelemetryMessage,
} from "./src/telemetry";

process.on("unhandledRejection", (reason) => {
	captureTelemetryException(reason, {
		"bardo.service": "mcp",
	});
	logTelemetryMessage("error", "mcp.process.unhandled_rejection", {
		"bardo.service": "mcp",
	});
	console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (error) => {
	captureTelemetryException(error, {
		"bardo.service": "mcp",
	});
	logTelemetryMessage("error", "mcp.process.uncaught_exception", {
		"bardo.service": "mcp",
	});
	console.error("Uncaught exception:", error);
});

validateRuntimeConfiguration({
	securityPolicy: SECURITY_POLICY,
	loopPolicy: LOOP_DETECTION_POLICY,
	toolPolicy: TOOL_POLICY_CONFIG,
});

const server = createHttpServer({ port: PORT });
const remoteToolCount = 6;

function describeAuthStartup() {
	if (SECURITY_POLICY.authMode !== "required") {
		return "Authentication disabled for this local runtime.";
	}

	if (apiKeyMap.size > 0) {
		return `Direct static credentials enabled (${apiKeyMap.size} credential(s) configured).`;
	}

	return "Hosted auth enabled; browser-approved bridge credentials are validated through the website.";
}

logTelemetryMessage("info", "mcp.startup.config", {
	"bardo.service": "mcp",
	"bardo.auth.mode": SECURITY_POLICY.authMode,
	"bardo.transport_mode": SECURITY_POLICY.transportMode,
	"bardo.telemetry_enabled": SECURITY_POLICY.telemetryEnabled,
	"bardo.metrics_route_enabled": SECURITY_POLICY.metricsRouteEnabled,
	"bardo.metrics_require_auth": SECURITY_POLICY.metricsRequireAuth,
});

console.log(
	`MCP server listening at ${new URL("/mcp", server.url).toString()}`,
);
console.log(describeAuthStartup());
console.log(
	`Runtime policy: authMode=${SECURITY_POLICY.authMode}, transportMode=${SECURITY_POLICY.transportMode}, maxRequestBytes=${SECURITY_POLICY.maxRequestBytes}, rateLimit=${SECURITY_POLICY.rateLimitMaxRequests}/${SECURITY_POLICY.rateLimitWindowMs}ms, telemetry=${SECURITY_POLICY.telemetryEnabled}, metricsRequireAuth=${SECURITY_POLICY.metricsRequireAuth}`,
);
console.log(
	`Tool surface: profile=${TOOL_POLICY_CONFIG.defaultProfile}, remoteV1Tools=${remoteToolCount}, providerRules=${Object.keys(TOOL_POLICY_CONFIG.byProvider).length}`,
);
console.log(
	`Loop protection: enabled=${LOOP_DETECTION_POLICY.enabled}, historySize=${LOOP_DETECTION_POLICY.historySize}, warning=${LOOP_DETECTION_POLICY.warningThreshold}, critical=${LOOP_DETECTION_POLICY.criticalThreshold}, breaker=${LOOP_DETECTION_POLICY.globalCircuitBreakerThreshold}`,
);
