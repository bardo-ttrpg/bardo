import { describe, expect, test } from "bun:test";
import { createConnectTelemetry } from "../../../../lib/connect-telemetry";
import { createRuntimeStatusGetHandler } from "./handlers";

describe("GET /api/connect/runtime-status", () => {
	test("returns 429 with rate-limit headers when runtime status budget is exhausted", async () => {
		const handler = createRuntimeStatusGetHandler({
			consumeBudget: async () => ({
				allowed: false,
				retryAfterSeconds: 30,
				limit: 120,
				remaining: 0,
				resetEpochSeconds: 1_800_000_030,
			}),
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/runtime-status", {
				headers: {
					authorization: "Bearer bardo_live_test",
				},
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(429);
		expect(body.error).toContain("Too many runtime status requests");
		expect(response.headers.get("retry-after")).toBe("30");
		expect(response.headers.get("x-ratelimit-limit")).toBe("120");
		expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
		expect(response.headers.get("x-ratelimit-reset")).toBe("1800000030");
	});

	test("returns the plan, scopes, and workspace path for a valid API key", async () => {
		const handler = createRuntimeStatusGetHandler({
			consumeBudget: async () => ({
				allowed: true,
				retryAfterSeconds: 60,
				limit: 120,
				remaining: 119,
				resetEpochSeconds: 1_800_000_000,
			}),
			createClerkClient: async () => ({
				apiKeys: {
					verify: async (secret: string) => {
						expect(secret).toBe("bardo_live_test");
						return {
							id: "key_123",
							subject: "user_123",
							scopes: ["mcp"],
							claims: {
								workspacePath: "./customers/user_123",
							},
						};
					},
				},
			}),
			resolvePlanForSubject: async (_clerk, subject) => {
				expect(subject).toBe("user_123");
				return {
					plan: "solo",
					billingUnavailable: false,
				};
			},
			mcpPeriodLimitResolver: (plan) => {
				expect(plan).toBe("solo");
				return 25_000;
			},
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/runtime-status", {
				headers: {
					authorization: "Bearer bardo_live_test",
				},
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get("x-ratelimit-limit")).toBe("120");
		expect(response.headers.get("x-ratelimit-remaining")).toBe("119");
		expect(response.headers.get("x-ratelimit-reset")).toBe("1800000000");
		expect(body).toEqual({
			valid: true,
			subjectId: "user_123",
			keyId: "key_123",
			scopes: ["mcp"],
			workspacePath: "./customers/user_123",
			plan: "solo",
			mcpPeriodLimit: 25_000,
			billingUnavailable: false,
		});
	});

	test("rejects requests without an API key", async () => {
		const handler = createRuntimeStatusGetHandler();

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/runtime-status"),
		);
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toContain("API key");
	});

	test("records runtime status success and invalid-key outcomes in connect telemetry", async () => {
		const telemetry = createConnectTelemetry();
		const handler = createRuntimeStatusGetHandler({
			telemetry,
			createClerkClient: async () => ({
				apiKeys: {
					verify: async (secret: string) => {
						if (secret === "bad-key") {
							const error = new Error("Invalid") as Error & {
								status: number;
							};
							error.status = 401;
							throw error;
						}
						return {
							id: "key_123",
							subject: "user_123",
							scopes: ["mcp"],
							claims: {
								workspacePath: "./customers/user_123",
							},
						};
					},
				},
			}),
			resolvePlanForSubject: async () => ({
				plan: "solo",
				billingUnavailable: false,
			}),
			mcpPeriodLimitResolver: () => 25_000,
		});

		await handler(
			new Request("https://app.bardo.ai/api/connect/runtime-status", {
				headers: {
					authorization: "Bearer good-key",
				},
			}),
		);
		await handler(
			new Request("https://app.bardo.ai/api/connect/runtime-status", {
				headers: {
					authorization: "Bearer bad-key",
				},
			}),
		);

		expect(telemetry.snapshot().runtime_status_success).toBe(1);
		expect(telemetry.snapshot().runtime_status_invalid).toBe(1);
	});
});
