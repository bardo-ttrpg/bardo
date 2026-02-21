import { describe, expect, test } from "bun:test";
import {
	resolveLoopDetectionPolicy,
	validateLoopDetectionPolicy,
} from "./loop-detection";

describe("loop detection policy", () => {
	test("uses secure defaults", () => {
		const policy = resolveLoopDetectionPolicy({});
		expect(policy.enabled).toBe(true);
		expect(policy.historySize).toBe(30);
		expect(policy.warningThreshold).toBe(10);
		expect(policy.criticalThreshold).toBe(20);
		expect(policy.globalCircuitBreakerThreshold).toBe(30);
	});

	test("supports environment overrides", () => {
		const policy = resolveLoopDetectionPolicy({
			BARDO_LOOP_DETECTION_ENABLED: "false",
			BARDO_LOOP_HISTORY_SIZE: "40",
			BARDO_LOOP_WARNING_THRESHOLD: "5",
			BARDO_LOOP_CRITICAL_THRESHOLD: "8",
			BARDO_LOOP_GLOBAL_CIRCUIT_BREAKER_THRESHOLD: "10",
		});
		expect(policy.enabled).toBe(false);
		expect(policy.historySize).toBe(40);
		expect(policy.warningThreshold).toBe(5);
		expect(policy.criticalThreshold).toBe(8);
		expect(policy.globalCircuitBreakerThreshold).toBe(10);
	});

	test("rejects invalid threshold ordering", () => {
		expect(() =>
			validateLoopDetectionPolicy({
				enabled: true,
				historySize: 30,
				warningThreshold: 10,
				criticalThreshold: 10,
				globalCircuitBreakerThreshold: 20,
			}),
		).toThrow("warningThreshold must be lower");
	});
});
