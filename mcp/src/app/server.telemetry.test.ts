import { afterEach, describe, expect, test } from "bun:test";
import type { SecurityPolicy } from "../domain/config/security";
import { resetTelemetryForTests } from "../telemetry";
import { createHttpServer } from "./server";

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
		...overrides,
	};
}

const servers: ReturnType<typeof createHttpServer>[] = [];

afterEach(() => {
	for (const server of servers.splice(0, servers.length)) {
		server.stop(true);
	}
	resetTelemetryForTests();
});

describe("createHttpServer telemetry route", () => {
	test("returns 404 when metrics route is disabled", async () => {
		const server = createHttpServer({
			port: 0,
			securityPolicy: makePolicy({ metricsRouteEnabled: false }),
		});
		servers.push(server);

		const response = await fetch(new URL("/metrics", server.url));
		expect(response.status).toBe(404);
	});

	test("returns prometheus metrics text when enabled", async () => {
		const server = createHttpServer({
			port: 0,
			securityPolicy: makePolicy(),
		});
		servers.push(server);

		await fetch(new URL("/health", server.url));
		const metricsResponse = await fetch(new URL("/metrics", server.url));
		const body = await metricsResponse.text();

		expect(metricsResponse.status).toBe(200);
		expect(metricsResponse.headers.get("content-type")).toContain("text/plain");
		expect(body).toContain("bardo_http_requests_total");
		expect(body).toContain('route="/health"');
	});

	test("requires auth when metricsRequireAuth is enabled", async () => {
		const server = createHttpServer({
			port: 0,
			securityPolicy: makePolicy({ metricsRequireAuth: true }),
		});
		servers.push(server);

		const response = await fetch(new URL("/metrics", server.url));
		expect(response.status).toBe(401);
	});
});
