import { describe, expect, test } from "bun:test";
import type { LoopDetectionPolicy } from "./loop-detection";
import type { SecurityPolicy } from "./security";
import type { ToolPolicyConfig } from "./tool-policy";
import { validateCurrentRuntimeConfiguration } from "./validate-runtime-config";

function createSecurityPolicy(
	overrides: Partial<SecurityPolicy> = {},
): SecurityPolicy {
	return {
		authMode: "optional",
		allowQueryApiKey: true,
		maxRequestBytes: 1_048_576,
		sessionTtlMs: 3_600_000,
		rateLimitWindowMs: 60_000,
		rateLimitMaxRequests: 120,
		rateLimitFailClosed: false,
		telemetryEnabled: true,
		metricsRouteEnabled: true,
		metricsRequireAuth: false,
		transportMode: "stateful",
		mcpEnableJsonResponse: false,
		...overrides,
	};
}

function createLoopPolicy(
	overrides: Partial<LoopDetectionPolicy> = {},
): LoopDetectionPolicy {
	return {
		enabled: true,
		historySize: 30,
		warningThreshold: 10,
		criticalThreshold: 20,
		globalCircuitBreakerThreshold: 30,
		...overrides,
	};
}

function createToolPolicy(): ToolPolicyConfig {
	return {
		defaultProfile: "full",
		baseAllowTokens: [],
		baseDenyTokens: [],
		byProvider: {},
	};
}

describe("validateCurrentRuntimeConfiguration", () => {
	test("passes through valid runtime policies", () => {
		expect(() =>
			validateCurrentRuntimeConfiguration({
				securityPolicy: createSecurityPolicy(),
				loopPolicy: createLoopPolicy(),
				toolPolicy: createToolPolicy(),
			}),
		).not.toThrow();
	});

	test("fails through the same strict-config rules used at startup", () => {
		expect(() =>
			validateCurrentRuntimeConfiguration({
				securityPolicy: createSecurityPolicy({
					telemetryEnabled: false,
					metricsRouteEnabled: true,
				}),
				loopPolicy: createLoopPolicy(),
				toolPolicy: createToolPolicy(),
			}),
		).toThrow("metrics route cannot be enabled");
	});
});
