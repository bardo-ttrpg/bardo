import { describe, expect, test } from "bun:test";
import {
	recordLegacyCompatibilityWriteMetric,
	recordLegacyFallbackReadMetric,
	renderPrometheusMetrics,
	resetTelemetryForTests,
} from "./index";

describe("legacy fallback telemetry", () => {
	test("records legacy fallback usage and strict-mode blocks", () => {
		resetTelemetryForTests();

		recordLegacyFallbackReadMetric({
			consumer: "state_get",
			strictMode: false,
			outcome: "used",
		});
		recordLegacyFallbackReadMetric({
			consumer: "consistency_check",
			strictMode: true,
			outcome: "blocked",
		});

		const metrics = renderPrometheusMetrics();
		expect(metrics).toContain("bardo_legacy_fallback_reads_total");
		expect(metrics).toContain(
			'bardo_legacy_fallback_reads_total{consumer="state_get",outcome="used",strictmode="false"} 1',
		);
		expect(metrics).toContain(
			'bardo_legacy_fallback_reads_total{consumer="consistency_check",outcome="blocked",strictmode="true"} 1',
		);
	});

	test("records legacy compatibility writes for state artifacts", () => {
		resetTelemetryForTests();

		recordLegacyCompatibilityWriteMetric({
			consumer: "init",
			artifact: "state_current",
			strictMode: false,
		});
		recordLegacyCompatibilityWriteMetric({
			consumer: "init",
			artifact: "state_history",
			strictMode: true,
		});

		const metrics = renderPrometheusMetrics();
		expect(metrics).toContain("bardo_legacy_compat_writes_total");
		expect(metrics).toContain(
			'bardo_legacy_compat_writes_total{artifact="state_current",consumer="init",strictmode="false"} 1',
		);
		expect(metrics).toContain(
			'bardo_legacy_compat_writes_total{artifact="state_history",consumer="init",strictmode="true"} 1',
		);
	});
});
