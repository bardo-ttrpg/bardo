import { apiKeyMap } from "./src/app/middleware/auth";
import { createHttpServer } from "./src/app/server";
import { PORT } from "./src/domain/config/constants";
import { LOOP_DETECTION_POLICY } from "./src/domain/config/loop-detection";
import { SECURITY_POLICY } from "./src/domain/config/security";
import { validateRuntimeConfiguration } from "./src/domain/config/strict-config";
import { TOOL_POLICY_CONFIG } from "./src/domain/config/tool-policy";

process.on("unhandledRejection", (reason) => {
	console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (error) => {
	console.error("Uncaught exception:", error);
});

validateRuntimeConfiguration({
	securityPolicy: SECURITY_POLICY,
	loopPolicy: LOOP_DETECTION_POLICY,
	toolPolicy: TOOL_POLICY_CONFIG,
});

const server = createHttpServer({ port: PORT });

console.log(
	`MCP server listening at ${new URL("/mcp", server.url).toString()}`,
);
console.log(
	apiKeyMap.size > 0
		? `API key auth enabled (${apiKeyMap.size} key(s) configured)`
		: "API key auth disabled (BARDO_API_KEYS_JSON not configured or invalid)",
);
console.log(
	`Security policy: authMode=${SECURITY_POLICY.authMode}, allowQueryApiKey=${SECURITY_POLICY.allowQueryApiKey}, sessionTtlMs=${SECURITY_POLICY.sessionTtlMs}, maxRequestBytes=${SECURITY_POLICY.maxRequestBytes}, telemetryEnabled=${SECURITY_POLICY.telemetryEnabled}, metricsRouteEnabled=${SECURITY_POLICY.metricsRouteEnabled}, metricsRequireAuth=${SECURITY_POLICY.metricsRequireAuth}, transportMode=${SECURITY_POLICY.transportMode}, mcpEnableJsonResponse=${SECURITY_POLICY.mcpEnableJsonResponse}`,
);
console.log(
	`Tool policy: profile=${TOOL_POLICY_CONFIG.defaultProfile}, baseAllow=${TOOL_POLICY_CONFIG.baseAllowTokens.length}, baseDeny=${TOOL_POLICY_CONFIG.baseDenyTokens.length}, providerRules=${Object.keys(TOOL_POLICY_CONFIG.byProvider).length}`,
);
console.log(
	`Loop protection: enabled=${LOOP_DETECTION_POLICY.enabled}, historySize=${LOOP_DETECTION_POLICY.historySize}, warning=${LOOP_DETECTION_POLICY.warningThreshold}, critical=${LOOP_DETECTION_POLICY.criticalThreshold}, breaker=${LOOP_DETECTION_POLICY.globalCircuitBreakerThreshold}`,
);
