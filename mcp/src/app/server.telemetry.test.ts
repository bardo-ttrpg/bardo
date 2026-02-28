import { afterEach, describe, expect, test } from "bun:test";
import type { SecurityPolicy } from "../domain/config/security";
import { resetTelemetryForTests } from "../telemetry";
import { createHttpRequestHandler } from "./server";

function makePolicy(overrides: Partial<SecurityPolicy> = {}): SecurityPolicy {
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

afterEach(() => {
	resetTelemetryForTests();
});

describe("createHttpServer telemetry route", () => {
	test("accepts /api/mcp as MCP route alias", async () => {
		const handler = createHttpRequestHandler({
			securityPolicy: makePolicy({
				authMode: "optional",
			}),
		});

		const response = await handler(
			new Request("http://localhost/api/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "ping",
					params: {},
				}),
			}),
		);
		expect(response.status).not.toBe(404);
	});

	test("returns 404 when metrics route is disabled", async () => {
		const handler = createHttpRequestHandler({
			securityPolicy: makePolicy({ metricsRouteEnabled: false }),
		});

		const response = await handler(new Request("http://localhost/metrics"));
		expect(response.status).toBe(404);
	});

	test("returns prometheus metrics text when enabled", async () => {
		const handler = createHttpRequestHandler({
			securityPolicy: makePolicy(),
		});

		await handler(new Request("http://localhost/health"));
		const metricsResponse = await handler(
			new Request("http://localhost/metrics"),
		);
		const body = await metricsResponse.text();

		expect(metricsResponse.status).toBe(200);
		expect(metricsResponse.headers.get("content-type")).toContain("text/plain");
		expect(body).toContain("bardo_http_requests_total");
		expect(body).toContain('route="/health"');
	});

	test("requires auth when metricsRequireAuth is enabled", async () => {
		const handler = createHttpRequestHandler({
			securityPolicy: makePolicy({ metricsRequireAuth: true }),
		});

		const response = await handler(new Request("http://localhost/metrics"));
		expect(response.status).toBe(401);
	});
});
