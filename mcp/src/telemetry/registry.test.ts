import { describe, expect, test } from "bun:test";
import { MetricsRegistry } from "./registry";

describe("MetricsRegistry", () => {
	test("increments counters with stable label ordering", () => {
		const registry = new MetricsRegistry();

		registry.inc("bardo_http_requests_total", {
			status: "200",
			method: "GET",
			route: "/health",
		});

		const text = registry.toPrometheusText();
		expect(text).toContain(
			'bardo_http_requests_total{method="get",route="/health",status="200"} 1',
		);
	});

	test("records histogram buckets, sum, and count", () => {
		const registry = new MetricsRegistry();
		registry.registerHistogram("bardo_http_request_duration_ms", {
			help: "HTTP request latency in milliseconds.",
			buckets: [50, 100],
		});

		registry.observe("bardo_http_request_duration_ms", 60, {
			method: "POST",
			route: "/mcp",
			status: "200",
		});

		const text = registry.toPrometheusText();
		expect(text).toContain(
			'bardo_http_request_duration_ms_bucket{le="50",method="post",route="/mcp",status="200"} 0',
		);
		expect(text).toContain(
			'bardo_http_request_duration_ms_bucket{le="100",method="post",route="/mcp",status="200"} 1',
		);
		expect(text).toContain(
			'bardo_http_request_duration_ms_bucket{le="+Inf",method="post",route="/mcp",status="200"} 1',
		);
		expect(text).toContain(
			'bardo_http_request_duration_ms_sum{method="post",route="/mcp",status="200"} 60',
		);
		expect(text).toContain(
			'bardo_http_request_duration_ms_count{method="post",route="/mcp",status="200"} 1',
		);
	});
});
