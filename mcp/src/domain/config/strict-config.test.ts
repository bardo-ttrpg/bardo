import { describe, expect, test } from "bun:test";
import type { LoopDetectionPolicy } from "./loop-detection";
import type { SecurityPolicy } from "./security";
import { validateRuntimeConfiguration } from "./strict-config";
import type { ToolPolicyConfig } from "./tool-policy";

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

describe("validateRuntimeConfiguration", () => {
	test("passes for valid policy combination", () => {
		expect(() =>
			validateRuntimeConfiguration({
				securityPolicy: createSecurityPolicy(),
				loopPolicy: createLoopPolicy(),
				toolPolicy: createToolPolicy(),
			}),
		).not.toThrow();
	});

	test("fails when metrics route is enabled while telemetry is disabled", () => {
		expect(() =>
			validateRuntimeConfiguration({
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
